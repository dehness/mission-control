/**
 * ### The Socket Module
 * The socket module handles most communications with clients.
 * Pure HTTP is actually used very rarely within Mission Control,
 * even though the interfaces for it are actually there.
 * <br>
 * Sockets have the advantage that they're real-time, which is very useful for home automation.
 * It also acts as a sort of networked message bus by broadcasting events.
 *
 * @module @socket
 * @requires socket.io
 * @requires jsonwebtoken
 */

const logger = require('@helpers/logger').createLogger('Socket', 'magenta');
const state = require('@state');
const socketIO = require('socket.io');
const socketAuth = require('./auth');

/**
 * Initialize the socket module.
 * @param  {Object} http A http server object.
 */
module.exports = function socket(http) {
	const server = socketIO(http);

	socketAuth(server, client => {
		let subscriptions = {};

		logger.debug('A new client connected');

		// On connection, we emit a initial-state event.
		// The client can use this to populate its state.
		client.emit('initial-state', {
			state: state.getState()
		});

		// The client can call actions by emitting the action event.
		// It has to pass the action and associated data.
		client.on('action', ({ action, data }) => {
			logger.debug(`Client requested action ${action}`);
			state.callAction(action, data);
		});

		// The client can emit a 'subscribe' event to subscribe to the state machines events.
		// These will then get relayed to the socket client.
		client.on('subscribe', ({ event }) => {
			if (event in subscriptions) return;

			logger.debug(`Client subscribed to ${event}.`);

			const relayAllEvents = (actualEvent, data) => {
				client.emit('all-events', {
					event: actualEvent,
					data
				});
			};

			const relaySingleEvent = data => {
				client.emit(event, data);
				// log(`Emitting ${event} to client.`);
			};

			// If a wildcard is passed we also pass the events name in the payload.
			const relayEvent =
				event === '*' ? relayAllEvents : relaySingleEvent;

			// We save the returned method from the subscribe function to later unsubscribe.
			subscriptions[event] = state.subscribe(event, relayEvent);
		});

		// When the client wants to unsubscribe remove the event
		client.on('unsubscribe', ({ event }) => {
			if (!(event in subscriptions)) return;

			logger.debug(`Unsubscribing client from event ${event}.`);

			subscriptions[event]();
			delete subscriptions[event];
		});

		// When the client disconnects unsubscribe all subscriptions
		client.on('disconnect', () => {
			logger.debug('A client disconnected.');

			Object.values(subscriptions).forEach(unsubscribe => unsubscribe());
			subscriptions = null;
		});
	});

	// server.use((socket, next) => {
	// 	if (socket.handshake.query && socket.handshake.query.token) {
	// 		const token = socket.handshake.query.token;

	// 		try {
	// 			// Verify JWT received with the secret
	// 			const payload = jwt.verify(token, config.auth.jwtSecret, {
	// 				issuer: config.auth.issuer,
	// 				audience: config.auth.audience
	// 			});

	// 			socket.jwt = token;
	// 			socket.jwtPayload = payload;
	// 			// Authenticated successfully

	// 			next(null);
	// 		} catch (e) {
	// 			log(
	// 				'Client couldnt be authorized. Invalid authentication token.'
	// 			);
	// 			next(new Error('Unauthorized'));
	// 		}
	// 	} else {
	// 		log('Client couldnt be authorized. Missing authentication token.');
	// 		next(new Error('Unauthorized'));
	// 	}
	// });
};
