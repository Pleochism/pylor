var Pylor = require("./pylor");
var utils = require("./utilities");
var Response = require("./response");

exports = module.exports = {options: {}};

var rolePermissionsCache = {};

exports.init = function(opts) {
	exports.server = opts.server;
	exports.passport = opts.passport;

	if(opts.window || !(typeof setImmediate === "function" && setImmediate))
		(opts.window || window).setImmediate = function (fn, a1, a2) { setTimeout(function() { fn(a1, a2); }, 0); };

	exports.log = opts.log || console;
	exports.options.ssl = !!opts.ssl;
	exports.options.version = opts.version || "v1";
	exports.options.apiRoot = opts.apiRoot || "api";
	exports.options.endpoint = opts.endpoint || "internal";
	exports.options.mockDogfood = opts.mockDogfood || false;
	exports.options.mockExceptions = opts.mockExceptions || [];

	exports.permissions = opts.permissions || {};
	exports.grants = opts.grants || {};

	exports.permissions = utils.generateGrantPermissions(exports.permissions, exports.grants);

	// If the library is being used in a web environment, it might provide its own dehydrated set of role permissions
	rolePermissionsCache = utils.expandObject(opts.rolePermissions || {}, []);
	exports.p = utils.expandObject(opts.permissions, []);
	exports.g = utils.mapGrants(exports.grants);
	if(opts.rolePermissions)
		exports.p = utils.merge(exports.p, rolePermissionsCache);

	if(opts.roles)
		Pylor.init({roles: opts.roles, log: opts.log, grants: exports.g});

	exports.Pylor = Pylor;

	var latest = {};

	exports.api = {};
	exports.api[exports.options.version] = latest;
	exports.api.latest = latest;
	exports.acacia = {};
};

exports.getRolePermissions = function() {
	return rolePermissionsCache;
};

["hasAccess", "DEFAULT_ROLE", "sslOn", "sslOff", "any", "only", "all", "registerAccessExtension", "getGrantValues", "registerGrantExtension", "matchGrantValues", "hasGrantAccess"].forEach(function(f) {
	exports[f] = Pylor[f];
});

// Disable HTTP basic
exports.noBasic = function(req, res, next) {
	req.noBasic = true;

	next();
};

exports.simpleErrors = function(req, res, next) {
	req.fullErrors = false;

	next();
};

exports.fullErrors = function(req, res, next) {
	req.fullErrors = true;

	next();
};

exports.response = function(res) {
	return new Response(res);
};

exports.end = exports.endResponse = function() {
	return new Response().end();
};

// Allow HTTP Basic authentication
exports.httpBasic = function(req, res, next) {
	if(req.noBasic || ("headers" in req && req.headers["x-auth-mechanism"] == "no-basic"))
		return next();
	if(req.session && req.session.user && ("_id" in req.session.user || "user_id" in req.session.user))
		return next();
	if(!("pylor" in req) || (!("any" in req.pylor) && !("only" in req.pylor)))
		return next();

	if(req.url)
		exports.passport.authenticate("basic", { session: false })(req, res, next);
	else
		next();
};

exports.httpEndpoint = function(req, res, err, opts) {
	opts = opts || {};

	var headers = opts.headers || {};

	var cacheBust = {
		"cache-control": "no-cache, no-store, must-revalidate",
		"pragma": "no-cache",
		"expires": 0
	};

	var heads = Object.keys(headers).map(function(item) { return item.toLowerCase(); });
	var caches = Object.keys(cacheBust).map(function(item) { return item.toLowerCase(); });

	caches.forEach(function(item) {
		if(heads.indexOf(item) == -1)
			headers[item] = cacheBust[item];
	});

	if(opts.checkResult && !opts.result) {
		err = {
			info: "Resource not found",
			statusCode: 410,
		};
	}

	if(opts.appendCSRF && req.csrfToken)
		opts.result._csrf = req.csrfToken();

	if(err) {
		err.reqPath = req.method + " " + req.path;
		var q = "";
		for(var qkey in req.query) {
			if(q === "")
				q = "?";
			if(qkey !== "_")
				q += qkey + "=" + req.query[qkey] + "&";
		}
		err.reqPath += q.slice(0, -1);

		if(!err.info)
			err.info = err.message;
		if(!err.detail)
			err.detail = err.message || err.info;
		if(req.session && req.session.user)
			err.person = req.session.user._id || req.session.user.user_id;

		// Log the full error
		if(!opts.noLog && !err.noLog)
			exports.log.error(err);

		var propDesc = Object.getOwnPropertyDescriptor(err, "_xerror");
		if(!propDesc && !req.fullErrors)
			return res.status(err.statusCode || 500).json({ info: "There was an error completing the request", detail: "An unexpected error occurred on the server" });

		err.stack = undefined;

		var code = err.statusCode || 500;
		err.statusCode = undefined;
		err.noLog = undefined;

		return res.status(code).json(err);
	}

	if(opts.session && req.session) {
		for(var key in opts.session)
			req.session[key] = opts.session[key];
	}
	if(opts.cookies) {
		for(var key2 in opts.cookies) {
			if(!opts.cookies[key2])
				res.clearCookie(key2);
			else
				res.cookie(key2, opts.cookies[key2].value, opts.cookies[key2].options);
		}
	}

	res.set(headers);
	if(opts.endResponse)
		return res.status(opts.code || 200).end();

	if(opts.raw)
		res.status(opts.code || 200).send(opts.result || "");
	else if(opts.stream)
		opts.stream.pipe(res);
	else
		res.status(opts.code || 200).json(opts.result || {});
};

exports.createHttpHandler = function(verb, cb, endpoint) {
	return function(req, res) {
		var stack = [];
		var opts = {};

		if(req.query.id) {
			opts.uid = req.query.id;
			opts.uids = utils.flatten([req.query.id]);
		}
		else {
			var p = req.route.path.split("/");
			while(p.length) {
				var piece = p.pop();
				if(piece.indexOf(":") === 0) {
					opts.uid = req.params[piece.slice(1).replace(/[\*\+\.\?]/g, "")];
					// Handles slashes and such
					if(req.params[0] && Object.keys(req.params).length === 2) {
						opts.uid += req.params[0];
						req.params[piece.slice(1).replace(/[\*\+\.\?]/g, "")] += req.params[0];
					}
					opts.uids = utils.flatten([opts.uid]);
					break;
				}
			}
		}

		opts.multiID = !Boolean(opts.uid) || Boolean(req.query.id) || Array.isArray(opts.uid);

		opts.headers = req.headers;
		opts.session = req.session || {};

		utils.extend(opts, req.params);

		stack.push(opts);

		if(cb.length < 2) {
			// No callback means a promise-based system
			var caller = endpoint || exports.httpEndpoint;
			try {
				return Promise.resolve(cb.apply(req, stack))
					.then(function(x) {
						if(typeof x === "undefined" || x === null)
							x = {};
						// Allow promises to return raw values
						if(["boolean", "string", "number"].indexOf(typeof x) > -1 || (!(x instanceof Response) && !("result" in x) && !("stream" in x) && !("endResponse" in x)))
							caller(req, res, null, { result: x });
						else
							caller(req, res, null, x);
					})
					.catch(function(e) { caller(req, res, e); });
			}
			catch(e) {
				caller(req, res, e);
				return Promise.reject(e);
			}
		}

		// Supply a callback if the function expects it
		stack.push(function(e, x) {
			if(typeof x === "undefined" || x === null)
				x = {};
			if(["boolean", "string", "number"].indexOf(typeof x) > -1 || (!(x instanceof Response) && !("result" in x) && !("stream" in x) && !("endResponse" in x)))
				x = { result: x };
			(endpoint || exports.httpEndpoint)(req, res, e, x);
		});

		//exports.log.debug("Loading API path", {path: req.path, verb: verb});
		cb.apply(req, stack);
	};
};

exports.createApiHandler = function(options, cb) {
	// If mocking is enabled and the current module is not excluded from the dummy list, return a dummy module
	// that allows for curated responses
	var mockDog = options.mockDogfood || exports.options.mockDogfood;
	var mockExcept = options.mockExceptions || exports.options.mockExceptions;

	if(mockDog && (!mockExcept || mockExcept.indexOf(Object.keys(options.spec || {})[0]) === -1)) {
		return function(opts, callback) {
			if(!callback || callback.length < 2) {
				if(opts.mockError)
					return Promise.reject(opts.mockError);
				return Promise.resolve(opts.mockResponse);
			}

			setImmediate(callback, opts.mockError, opts.mockResponse);
		};
	}

	return function(opts, callback) {
		if(typeof opts == "function") {
			callback = opts;
			opts = {};
		}
		opts = opts || {};
		opts.internal = true;

		var params = [];

		if(opts.uid)
			opts.uids = utils.flatten([opts.uid]);
		opts.multiID = !("uid" in opts) || Array.isArray(opts.uid);

		opts.headers = this.headers || opts.headers || {};
		opts.query = this.query || opts.query || {};
		opts.session = this.session || opts.session || {};
		opts.body = this.body || opts.body || {};

		params.push(opts);

		if(!callback) {
			// The target function is promise based

			if(cb.length < 2) {
				// The source function is promise based
				try {
					return cb.call(opts, opts).then(function(x) {
						if(x instanceof Response) {
							// If we're mocking, send back the entire response so we can verify all the contents
							if(mockDog)
								return x;
							return x.result;
						}
						return x;
					});
				}
				catch(e) {
					return Promise.reject(e);
				}
			}
			else {
				// The source function is callback based
				return new Promise(function(resolve, reject) {
					try {
						cb.call(opts, opts, function(e, x) {
							if(e)
								return reject(e);
							resolve(x.result);
						});
					}
					catch(e) {
						reject(e);
					}
				});
			}
		}
		else {
			// The target function is callback based
			if(cb.length < 2) {
				// The source function is promise based
				try {
					cb.call(opts, opts)
						.then(function(x) {
							if(x instanceof Response)
								x = x.result;
							setImmediate(callback, null, x);
						})
						.catch(function(e) { setImmediate(callback, e); });
				}
				catch(e) {
					setImmediate(callback, e);
				}
			}
			else {
				// The source function is callback based
				params.push(function(e, r) {
					if(r && "result" in r && r.result instanceof Response)
						return callback(e, r.result.result);

					callback(e, r ? r.result : undefined);
				});
				cb.apply(opts, params);
			}
		}
	};
};

exports.createApiPermissionChecks = function(path, verb) {
	var ret = [];

	var root = "";
	if(path.indexOf("/api") === 0)
		root = "api.";

	var pathPieces = path.split("/");
	// Drop the API root and the version
	if(pathPieces[1] === "api")
		pathPieces = pathPieces.slice(3);
	else
		pathPieces = pathPieces.slice(1);

	var paths = [];

	if(path.indexOf("/:") > -1) {
		paths.push(pathPieces.map(function(item) {
			// Wildcard
			if(item[0] == ":")
				return item.slice(1).replace(/[\*\+\.\?]/g, "");
			return item;
		}));
	}

	paths.push(utils.compact(pathPieces.map(function(item, index) {
		if(index === (pathPieces.length - 1) && item === ":uid")
			return;
		// Wildcard
		if(item[0] == ":")
			return "_";
		return item;
	})));

	paths.forEach(function(pathPieces) {
		ret.push(root + pathPieces.join(".") + "." + verb);
	});

	return ret;
};

// Construct permissions for a given path
exports.buildPathPermissions = function(path, verb) {
	var paths = exports.createApiPermissionChecks(path, verb);

	var ret = {}, link;

	paths.forEach(function(p) {
		link = ret;

		p.split(".").slice(0, -1).forEach(function(item) {
			if(!(item in link))
				link[item] = {};
			link = link[item];
		});

		link[verb] = p;
	});

	return ret;
};

// Parse a JSON REST spec and activate it in Express
exports.activate = function(spec, options) {
	options = options || {};

	options.spec = spec;

	// "get+" is for endpoints that should listen for both single and multiple values
	// Ordinary get does not listen for IDs
	var verbs = ["get", "post", "put", "delete", "del", "get+", "patch", "put-"];

	var readRestObject = function(obj, path, access, mware) {
		var deeper = [];
		if(!obj)
			throw new Error("Missing handler for endpoint: " + path.join("/"));

		// Check for middlware keys first
		if("_middleware" in obj) {
			mware = mware.concat(obj._middleware);
			delete obj._middleware;
		}

		Object.keys(obj).forEach(function(key) {
			if(verbs.indexOf(key.toLowerCase()) > -1 || typeof obj[key] === "function" || Array.isArray(obj[key])) {
				var verb = key.toLowerCase();
				var localPath = path.slice(0);
				if((typeof obj[key] == "function" || Array.isArray(obj[key])) && verbs.indexOf(key) == -1) {
					verb = "get";
					localPath = localPath.concat(key);
				}

				if(verb == "del") verb = "delete";
				var actives = [], inlineMware;

				// Allow inline middleware specification
				var func = obj[key];
				if(Array.isArray(func)) {
					inlineMware = mware.concat(func.slice(0, -1));
					func = func.slice(-1)[0];
				}

				if(!func)
					throw new Error("No valid handler was found for the endpoint '" + key.toUpperCase() + " " + path.join("/") + "'");

				if(["get", "post", "get+", "put-"].indexOf(verb) > -1)
					actives.push(localPath.join("/"));
				if(["get+", "put", "delete", "patch"].indexOf(verb) > -1)
					actives.push(localPath.join("/") + "/:uid");

				if(verb == "get+")
					verb = "get";
				if(verb == "put-")
					verb = "put";

				// Attach to the Express-compatible server
				if(exports.server) {
					actives.forEach(function(val) {
						var pp = exports.buildPathPermissions(val, verb);
						// Save the permissions into a cache to be fetched later and sent to a web client
						// Web clients don't know about the server-side paths and therefore would not be able to do permission checks on them
						// Sending them a dehydrated copy of these permissions allows them to
						utils.merge(rolePermissionsCache, pp);
						utils.merge(exports.p, pp);

						// (path, sslCheck, apiPermissionDefine, middleware1, middleware2...middlewareN, permissionsCheck, handler)
						//console.log(inlineMware || mware);
						var args = [val, exports.options.ssl ? Pylor.sslOn : Pylor.sslOff, Pylor.any(exports.createApiPermissionChecks(val, verb))].concat(inlineMware || mware);
						if(exports.passport)
							args = args.concat(exports.httpBasic);
						args = args.concat(Pylor.checkPermission).concat(exports.createHttpHandler(verb, func));
						exports.server[verb].apply(exports.server, args);
					});
				}

				// Methods for internal use
				// Parameters are renamed as the key name, for convenience.
				if(key[0] == ":") {
					if(!access[key.slice(1).replace(/[\*\+\.\?]/g, "")])
						access[key.slice(1).replace(/[\*\+\.\?]/g, "")] = {};
					if(!access[key.replace(/[\*\+\.\?]/g, "")])
						access[key.replace(/[\*\+\.\?]/g, "")] = {};

					access[key.slice(1).replace(/[\*\+\.\?]/g, "")][verb] = access[key.replace(/[\*\+\.\?]/g, "")][verb] = exports.createApiHandler(options, func);
				}
				else if(verbs.indexOf(key) === -1) {
					if(!access[key])
						access[key] = {};
					access[key][verb] = exports.createApiHandler(options, func);
				}
				else
					access[verb] = exports.createApiHandler(options, func);
			}
			else {
				deeper.push(key);
				if(key[0] == ":")
					access[key.slice(1).replace(/[\*\+\.\?]/g, "")] = {};
				else
					access[key] = {};
			}
		});

		// Recuse on the keys that were not middleware or verbs
		deeper.forEach(function(key) {
			readRestObject(obj[key], path.concat(key), access[key[0] === ":" ? key.slice(1).replace(/[\*\+\.\?]/g, "") : key], mware);
		});
	};

	var pathRoot = ["/" + exports.options.apiRoot + "/" + exports.options.version];
	var objRoot = exports.api.latest;
	if(options.api === false) {
		pathRoot = ["/" + exports.options.endpoint];
		objRoot = exports.acacia;
	}
	readRestObject(spec, pathRoot, objRoot, []);
};