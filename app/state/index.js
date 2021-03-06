/**
 * ### The State Machine, heart and soul of mission control.
 *
 * The state maching is responsible for keeping the state for lights etc.
 * It works in a similar way that React/Redux works. But its simplified in that
 * reducers and actions are basically merged.
 * We have a store that holds all the data. This store is immutable.
 * To update data in the store, we need to define actions.
 * The actions will take the old state, and create a new one with updated data.
 * When an action is run / data is updated, the state machine's event emitter
 * sends a trigger that data has changed.
 * This will be broadcasted to internal services inside mission control or through
 * a Node-RED component. Node-RED flows can then update accordingly.
 *
 * This means, that the state machine resembles the SSOT (single source of truth).
 *
 * You can subscribe to specific data points in the state machine e.g.:
 * This will only trigger when any data within the lights.desk object changes.
 *
 * Action names are always all caps to reduce errors when calling them.
 * An action cannot have side effects. HTTP requests and similar async tasks
 * are handled outside the state machine, to reduce complexity.
 *
 * @example
 * state.subscribe('update:lights.desk')
 * state.subscribe('action:ACTION_NAME')
 * @example
 * function ACTION(oldState, actionData) {
 *     return Object.extend({}, oldState, { lampOn: actionData.isOn });
 * }
 * @module @state
 * @since 1.0.0
 * @requires eventemitter2
 * @requires object-diff
 * @requires @state/initial-state
 */

// const config = require('@config');
const EventEmitter = require('eventemitter2');
const diff = require('object-diff');

// const ActionEvent = require('@state/events/ActionEvent');

const logger = require('@helpers/logger').createLogger('State', 'blueBright');

const emitter = new EventEmitter({
	wildcard: true,
	delimiter: ':'
});

let actions = {};
let state = require('./initial-state');

/**
 * Register a reducer for a given state action
 * @param {string} action The action to register a reducer for
 * @param {Function} reducer The reducer function
 * @param {Function} validate The data validation function
 */
function registerReducer(action, reducer, validate) {
	actions[action] = {
		reducer,
		validate
	};
}

/**
 * Subscribe to mission control events.
 *
 * This function is used to subscribe to any event within the server.
 * If the passed event is '*' the listener will be subscribed to all events.
 *
 * @param  {String} event - The event to subscribe to. Can be '*' to subscribe to all events.
 * @param  {Function} callback - The callback / listener function.
 * @return {Function} A function to remove the listener when called.
 */
function subscribe(event, callback) {
	// Subscribe to event
	if (event === '*') {
		emitter.onAny(callback);
	} else {
		emitter.on(event, callback);
	}

	// Return function to unsubscribe
	return () => {
		if (event === '*') {
			emitter.offAny(callback);
		} else {
			emitter.removeListener(event, callback);
		}
	};
}

// The call method will run an action on the state with given arguments.
/**
 * Evoke an action.
 *
 * This method will run an action on the state machine.
 * Every action has a function and a validator.
 * This function first runs the validator to see if the incoming data is valid
 * and then executed the action function.
 *
 * @param {String} actionKey - The action to evoke.
 * @param {Object} data - The data object to pass along to the action reducer/handler.
 *
 * @emits 'update'
 */
function callAction(actionKey, data) {
	logger.debug(`Running action ${actionKey} with data: ${JSON.stringify(
		data
	)}`);

	// Normalize action name
	actionKey = actionKey.toUpperCase();

	// Throw an error if action doesn't exist
	if (!(actionKey in actions)) {
		logger.error(`Could not find action '${actionKey}'`);
		return;
	}

	const action = actions[actionKey];

	if (!action.validate(data)) {
		logger.error(`Data for action '${actionKey}' is invalid`);
		return;
	}

	// Run the action with the old state
	const oldState = state;
	const newState = action.reducer(oldState, data);

	// We extend an empty object to remove all ties to the old state
	/*
	 * !!! ONLY TIME WE EVER SET STATE VARIABLE !!!
	 */
	state = Object.assign({}, newState);

	// Get a diff of the old and new state.
	// Using that diff we determine what the emitter should emit.
	// The state provided in update events that are limited to a key is
	// only the state that was updated.
	const stateDiff = diff(oldState, newState);
	Object.keys(stateDiff).forEach(changedKey => {
		emitter.emit(`update:${changedKey}`, {
			state: stateDiff
		});
	});

	// Emit a general state update event
	emitter.emit('update', {
		state: stateDiff,
		action: actionKey,
		diff: Object.keys(stateDiff)
	});
	emitter.emit(`action:${actionKey}`, {
		state: newState,
		action: actionKey,
		actionData: data,
		diff: Object.keys(stateDiff)
	});

	// const actionEvent = new ActionEvent(actionKey, data, diff);
	// emitter.emit(`_action:${actionKey}`, actionEvent);
}

/**
 * Emit an event to the state machine message bus.
 *
 * @param  {String} event - The event type to be emitted.
 * @param  {Object} data - The data to be emitted as a payload.
 */
function emitEvent(event, data) {
	emitter.emit(event, data);
}

/**
 * Get the current state of the state machine.
 * @return {Object}
 */
function getState() {
	return state;
}

module.exports = {
	registerReducer,
	subscribe,
	callAction,
	emitEvent,
	getState
};
