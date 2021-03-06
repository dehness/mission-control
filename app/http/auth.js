const config = require('@config');
const logging = require('@helpers/logger');
const logger = logging.createLogger('Auth');

const passport = require('passport');
const jwt = require('jsonwebtoken');
const JWTStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const queryString = require('querystring');
const proxy = require('http-proxy-middleware');


/*
	How the auth system works
	=========================

	We have a SSO server that we redirect to, if we are not logged in.
	That server, on a successful login, returns a JSON Web Token (JWT).

	It will then redirect us back to the page we came from which is specified in
	the querystring ('redirect_url') of the first request to the SSO server.

	In this server, we will then get that jwt that was also passed as a querystring ('auth_token')
	and verify it with the same key the SSO server used to sign the token.

	If this verification is successful, we add the JWT to the session object.

	When we now try to access a resource, that is protected by passport, the passport JWTStrategy 
	will kick in. The JWTStrategy checks the session object for the JWT. If there is one present,
	it will get verified. When that is successful and the token has not expired, 
	it lets the request pass.
*/

module.exports = function authRoutes(app, requireAuthentication) {
	app.use(passport.initialize());
	app.use(passport.session());

	passport.use(
		new JWTStrategy(
			{
				jwtFromRequest: ExtractJwt.fromExtractors([
					req => {
						if (req && req.session) {
							return req.session.jwt || null;
						}

						return null;
					}
					// ExtractJwt.fromUrlQueryParameter('token')
				]),
				secretOrKey: config.auth.secret,
				issuer: config.auth.issuer,
				audience: config.auth.audience
			},
			(jwtPayload, done) => {
				if (!jwtPayload.user) {
					logger.warn('JWT did not contain a user object.', jwtPayload);
					return done(null, false);
				}

				return done(null, jwtPayload.user);
			}
		)
	);

	app.get('/auth', requireAuthentication(), (req, res) => {
		res.json(req.user);
	});

	app.get('/auth/login', (req, res) => {
		req.session.redirectUrl = req.query.redirect_url;

		req.session.save(err => {
			if (err) logger.error('Error saving session', err);

			res.redirect(
				`${config.auth.url}/api/v1/authenticate` +
				'?' +
				queryString.stringify({
					redirect_url: `${config.http.url}/auth/callback`
				})
			);
		});
	});

	app.get('/auth/callback', (req, res) => {
		const token = req.query.auth_token;
		try {
			// Verify JWT received with the secret
			jwt.verify(token, config.auth.secret, {
				issuer: config.auth.issuer,
				audience: config.auth.audience
			});
			req.session.jwt = token;

			const redirectUrl = req.session.redirectUrl || '/';
			delete req.session.redirectUrl;

			res.redirect(redirectUrl);
		} catch (e) {
			logger.debug('Authorization callback failed', e);
			res.status(401).json('Unauthorized');
		}
	});

	app.get('/auth/logout', (req, res) => {
		req.logout();
		req.session.destroy();
		res.redirect(`${config.auth.url}/logout`);
	});


	// app.get('/auth/v2/login')

	if (config.auth.proxy) {
		app.use(
			'/sso',
			proxy(
				'/',
				{
					target: `http://localhost:${config.auth.port}`,
					logLevel: config.debug ? 'debug' : 'warn',
					// ws: true,
					pathRewrite: {
						'^/sso': '/',
						'^/sso/': '/'
					}
				}
			)
		);
	}

	/**
		GET /login - Serve Login Page

		POST /v2/auth - Authenticate login credentials

		POST /v2/auth/token
		POST /v2/auth/logout - Logout the User
	*/
};
