// jshint ignore: start
/* eslint no-unused-vars: "off" */
/* eslint no-unused-expressions: "off" */
/* eslint max-nested-callbacks: "off" */
/* jshint unused:false */
/* global describe, it, before, beforeEach, after, afterEach */

var proxyquire = require("proxyquire");
var sinon = require("sinon");
var chai = require("chai");
chai.use(require("chai-datetime"));
chai.use(require("chai-match-pattern"));
var nock = require("nock");
var fsmock = require("mock-fs");
var path = require("path");
var fs = require("fs");
var _ = require("lodash-match-pattern").getLodashModule();
var moment = require("moment");

var utils = require("../lib/utilities");
var pylor = require("../lib/pylor");
var Response = require("../lib/response");

var expect = chai.expect;
var assert = chai.assert;

var stubs = {
	logStub: {
		debug: sinon.spy(),
		info: sinon.spy(),
		warn: sinon.spy(),
		error: sinon.spy(),
	},
};

var module, passportSpy, opts;

describe("Rester", function() {
	before(function() {
		module = require("../lib/rester");
	});

	beforeEach(function() {
		passportSpy = sinon.spy();

		opts = {
			server: false,
			passport: {
				authenticate: function() {
					return passportSpy;
				},
			},
			log: {
				info: sinon.spy(),
				error: sinon.spy(),
				warn: sinon.spy(),
				debug: sinon.spy(),
			},
		};

		sinon.spy(opts.passport, "authenticate");

		module.init(opts);
	});

	it("should override setImmediate in a browser environment", function(done) {
		opts = {
			server: false,
			window: {},
		};

		module.init(opts);

		opts.window.setImmediate(function() { done(); });
	});

	it("should merge provided rolePermissions with internal ones", function() {
		var opts = {
			rolePermissions: {
				foo: {
					bar: "",
				},
			},
			permissions: {
				"a": "",
				"b": "",
			},
		};

		module.init(opts);

		expect(module.p).to.matchPattern({
			foo: {
				bar: "foo.bar",
			},
			a: "a",
			b: "b",
			grants: {
				main: {},
				all: {},
			},
		});
	});

	it("should invoke Pylor if roles are provided", function() {
		var spy = sinon.spy(pylor, "init");
		var opts = {
			roles: {

			},
		};

		module.init(opts);

		expect(spy.called).to.be.true;
	});

	it("should return a response object", function() {
		var res = module.response({ moo: 1 });
		expect(res).to.be.an.instanceof(Response);
		expect(res.result).to.matchPattern({ moo: 1 });
	});

	it("should end a response", function() {
		var res = module.end();
		var res2 = module.endResponse();
		expect(res).to.be.an.instanceof(Response);
		expect(res.endResponse).to.be.true;
		expect(res2).to.be.an.instanceof(Response);
		expect(res2.endResponse).to.be.true;
	});

	it("should expose certain functions from Pylor", function() {
		var maps = ["hasAccess", "sslOn", "sslOff", "any", "only", "all", "registerAccessExtension", "getGrantValues", "registerGrantExtension", "matchGrantValues", "hasGrantAccess"];
		_.each(maps, x => {
			expect(module[x], x).to.be.an.instanceof(Function);
		});
	});

	it("should set the HTTP basic disable property with noBasic()", function() {
		var next = sinon.spy();
		var req = {};
		module.noBasic(req, {}, next);

		expect(next.called).to.be.true;
		expect(req).to.matchPattern({ noBasic: true });
	});

	describe("httpBasic()", function() {
		it("should do nothing if basic auth is disabled with a property on req", function() {
			var next = sinon.spy();
			module.httpBasic({ noBasic: true }, {}, next);

			expect(next.called).to.be.true;
			expect(opts.passport.authenticate.called).to.be.false;
		});

		it("should do nothing if basic auth is disabled with an HTTP header", function() {
			var next = sinon.spy();
			module.httpBasic({ session: { user: { } }, headers: { "x-auth-mechanism": "no-basic" } }, {}, next);

			expect(next.called).to.be.true;
			expect(opts.passport.authenticate.called).to.be.false;
		});

		it("should do nothing if the user is already authenticated with _id", function() {
			var next = sinon.spy();
			module.httpBasic({ session: { user: { _id: 0 } } }, {}, next);

			expect(next.called).to.be.true;
			expect(opts.passport.authenticate.called).to.be.false;
		});

		it("should do nothing if the user is already authenticated with user_id", function() {
			var next = sinon.spy();
			module.httpBasic({ session: { user: { user_id: 0 } } }, {}, next);

			expect(next.called).to.be.true;
			expect(opts.passport.authenticate.called).to.be.false;
		});

		it("should do nothing if there is no pylor", function() {
			var next = sinon.spy();
			module.httpBasic({  }, {}, next);

			expect(next.called).to.be.true;
			expect(opts.passport.authenticate.called).to.be.false;
		});

		it("should do nothing if there is no .any or .all permissions", function() {
			var next = sinon.spy();
			module.httpBasic({ pylor: {} }, {}, next);

			expect(next.called).to.be.true;
			expect(opts.passport.authenticate.called).to.be.false;
		});

		it("should do nothing if the call has no URL", function() {
			var next = sinon.spy();
			module.httpBasic({ pylor: { any: [] } }, {}, next);

			expect(next.called).to.be.true;
			expect(opts.passport.authenticate.called).to.be.false;
		});

		it("should delegate to passport if basic auth is needed", function() {
			var next = sinon.spy();
			var req = { pylor: { any: [] }, url: "/" };
			var res = {};
			module.httpBasic(req, res, {}, next);

			expect(opts.passport.authenticate.calledWith("basic", { session: false }), "passport authenticate").to.be.true;
			expect(passportSpy.called, "passport middleware").to.be.true;
		});
	});

	describe("createHttpHandler()", function() {
		var res;

		before(function() {
			res = {
				status: () => res,
				cookie: () => res,
				clearCookie: () => res,
				json: () => res,
				headers: {

				},
				end: () => res,
				set: () => res,
				send: () => res,
			};

			sinon.spy(res, "status");
			sinon.spy(res, "cookie");
			sinon.spy(res, "json");
			sinon.spy(res, "end");
			sinon.spy(res, "set");
			sinon.spy(res, "clearCookie");
			sinon.spy(res, "send");
		});

		beforeEach(function() {
			for(var key in res)
				if(typeof res[key] === "function")
					res[key].reset();
		});

		var req = {
			query: {
				id: "id",
			},
			route: {
				path: "/moo/cow",
			},
			headers: {

			},
			params: {
				narf: 1,
				derp: "moo",
			},
			path: "",
		};

		it("should return a middleware function", function() {
			var cb = sinon.spy();

			expect(module.createHttpHandler("get", cb).length).to.equal(2);
		});

		it("should set the scope of the middleware function to the req of the middleware call", function() {
			var scope;
			var calls = {
				cb: function() { scope = this; },
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb);

			mware(req, res);

			expect(calls.cb.called).to.be.true;
			expect(scope, "middleware 'this'").to.equal(req);
		});

		it("should wrap values to make the output function happy", function() {
			var calls = {
				cb: function(o, c) { c(null, [1]); },
				endpoint: sinon.spy(),
			};

			var spy = sinon.spy();

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, spy);

			var ret = mware(req, res);

			return expect(spy.args[0][3]).to.matchPattern({ result: [1] });
		});

		it("should insert a default value if no response is sent back", function() {
			var calls = {
				cb: function(o, c) { c(null); },
				endpoint: sinon.spy(),
			};

			var spy = sinon.spy();

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, spy);

			var ret = mware(req, res);

			return expect(spy.args[0][3]).to.matchPattern({ result: {} });
		});

		it("should insert a default value if no response is sent back for promises", function() {
			var calls = {
				cb: function(o) { return Promise.resolve(null); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => {
				expect(calls.endpoint.args[0][2]).to.be.null;
				expect(calls.endpoint.args[0][3]).to.matchPattern({ result: {} });
			});
		});

		it("should handle callback responses with only an error", function() {
			var calls = {
				cb: function(o, c) { c(new Error("1")); },
				endpoint: sinon.spy(),
			};

			var spy = sinon.spy();

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, spy);

			var ret = mware(req, res);

			return expect(spy.args[0][2]).to.be.instanceOf(Error);
		});

		it("should return a promise if the handler doesn't accept a callback", function() {
			var calls = {
				cb: function(o) { return Promise.resolve({ result: [1] }); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => {
				expect(calls.endpoint.args[0][2]).to.be.null;
				expect(calls.endpoint.args[0][3]).to.matchPattern({ result: [1] });
			});
		});

		it("should return a promise if the handler doesn't accept a callback and wrap plain values", function() {
			var calls = {
				cb: function(o) { return Promise.resolve([1]); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => {
				expect(calls.endpoint.args[0][2]).to.be.null;
				expect(calls.endpoint.args[0][3]).to.matchPattern({ result: [1] });
			});
		});

		it("should return a promise if the handler doesn't accept a callback and insert a default value", function() {
			var calls = {
				cb: function(o) { return Promise.resolve(); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => {
				expect(calls.endpoint.args[0][2]).to.be.null;
				expect(calls.endpoint.args[0][3]).to.matchPattern({ result: {} });
			});
		});

		it("should return a promise if the handler doesn't accept a callback and not wrap Response values", function() {
			var calls = {
				cb: function(o) { return Promise.resolve(new Response([1])); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => {
				expect(calls.endpoint.args[0][2]).to.be.null;
				expect(calls.endpoint.args[0][3]).to.matchPattern({ result: [1] });
			});
		});

		it("should return a promise if the handler doesn't accept a callback and not wrap object values", function() {
			var calls = {
				cb: function(o) { return Promise.resolve({ result: [1] }); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => {
				expect(calls.endpoint.args[0][2]).to.be.null;
				expect(calls.endpoint.args[0][3]).to.matchPattern({ result: [1] });
			});
		});

		it("should return a failed promise if the handler doesn't accept a callback and throws", function() {
			var calls = {
				cb: function(o) { throw new Error("onoes"); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => assert(false))
				.catch(e => {
					expect(e).to.be.instanceof(Error);
					expect(calls.endpoint.args[0][2]).to.equal(e);
					expect(calls.endpoint.args[0][3]).to.be.undefined;
				});
		});

		it("should return a failed promise if the handler doesn't accept a callback and returns an error", function() {
			var calls = {
				cb: function(o) { return Promise.reject(new Error("1")); },
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb, calls.endpoint);

			var ret = mware(req, res);

			return Promise.resolve(ret).then(() => assert(false))
				.catch(e => {
					expect(e).to.be.instanceof(Error);
				});
		});

		it("should detect if a function takes an options argument and provide it", function() {
			var calls = {
				cb: function(o, c) {},
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb);

			mware(req, res);

			expect(calls.cb.args[0][0]).to.matchPattern({
				multiID: true,
				headers: {},
				uid: "id",
				uids: ["id"],
				narf: 1,
				derp: "moo",
				session: {},
			});
			expect(calls.cb.args[0][1]).to.be.an.instanceof(Function);
		});

		it("should capture the last path variable and store it as uid if there is no applicable query value", function() {
			var calls = {
				cb: function(o, c) {},
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb);

			var customReq = _.clone(req);
			customReq.query = {};
			customReq.route.path = "/foo/:narf/moo/wut";

			mware(customReq, res);

			expect(calls.cb.args[0][0].uid).to.equal(1);
			expect(calls.cb.args[0][0].uids).to.matchPattern([1]);
		});

		it("should expose all params values on the options object", function() {
			var calls = {
				cb: function(o, c) {},
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb);

			var customReq = _.clone(req);
			customReq.query = {};
			customReq.params = {
				a: 1,
				b: 2,
				c: 3,
			},
			customReq.route.path = "/foo/:narf";

			mware(customReq, res);

			expect(calls.cb.args[0][0].a).to.equal(1);
			expect(calls.cb.args[0][0].b).to.equal(2);
			expect(calls.cb.args[0][0].c).to.equal(3);
		});

		it("should remove regex-related values from params", function() {
			var calls = {
				cb: function(o, c) {},
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb);

			var customReq = _.clone(req);
			customReq.query = {};
			customReq.params = {
				narf: 1,
			},
			customReq.route.path = "/foo/:narf*?.+";

			mware(customReq, res);

			expect(calls.cb.args[0][0].narf).to.equal(1);
		});

		it("should handle encoded slashes in parameters", function() {
			var calls = {
				cb: function(o, c) {},
				endpoint: sinon.spy(),
			};

			sinon.spy(calls, "cb");

			var mware = module.createHttpHandler("get", calls.cb);

			var customReq = _.clone(req);
			customReq.query = {};
			customReq.params = [
				"/slash",
			],
			customReq.params.narf = "test";
			customReq.route.path = "/foo/:narf*";

			mware(customReq, res);

			expect(calls.cb.args[0][0].narf).to.equal("test/slash");
			expect(calls.cb.args[0][0].uid).to.equal("test/slash");
		});

		describe("HTTP endpoint", function() {
			var req = {
				query: {
				},
				route: {
					path: "/foo/:narf",
				},
				headers: {

				},
				params: {
					a: 1,
					b: 2,
					c: 3,
				},
				path: "/some/path",
				method: "GRUNT",
				session: {},
			};

			it("should add cache headers to force no caching", function() {
				var output = {};

				module.httpEndpoint(req, res, null, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(200)).to.be.true;
				expect(res.set.calledWith({ "cache-control": "no-cache, no-store, must-revalidate", "pragma": "no-cache", "expires": 0 })).to.be.true;
			});

			it("should extend existing cache headers", function() {
				var creq = _.clone(req);
				creq.headers = {
					"CACHE-CONTROL": "always",
					"expires": 1,
				};

				var output = {
					headers: creq.headers,
				};

				module.httpEndpoint(creq, res, null, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(200)).to.be.true;
				expect(res.set.calledWith({ "CACHE-CONTROL": "always", "pragma": "no-cache", "expires": 1 })).to.be.true;
			});

			it("should return an error if the checked response fails", function() {
				var output = {
					checkResult: true,
				};

				req.fullErrors = true;

				module.httpEndpoint(req, res, null, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(410)).to.be.true;
				expect(res.json.calledWith({ info: "Resource not found", detail: "Resource not found", reqPath: "GRUNT /some/path", statusCode: undefined, noLog: undefined, stack: undefined })).to.be.true;

				req.fullErrors = false;
			});

			it("should append a CSRF token if requested", function() {
				var creq = _.clone(req);
				creq.csrfToken = () => "12345";

				var output = {
					appendCSRF: true,
					result: { },
				};

				module.httpEndpoint(creq, res, null, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(200)).to.be.true;
				expect(res.json.calledWith({ _csrf: "12345" })).to.be.true;
			});

			it("should output errors if they occurred", function() {
				var output = {};

				var e = new Error("Some error here");
				e.detail = "Moo";

				req.fullErrors = true;

				module.httpEndpoint(req, res, e, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(500)).to.be.true;
				expect(res.json.calledWith(e)).to.be.true;

				req.fullErrors = false;
			});

			it("should output simple errors if requested and an error occurred", function() {
				var output = {};

				var e = new Error("Some error here");
				req.fullErrors = false;

				module.httpEndpoint(req, res, e, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(500)).to.be.true;
				expect(res.json.args[0][0]).to.matchPattern({ info: "There was an error completing the request", detail: "An unexpected error occurred on the server" });

				delete req.fullErrors;
			});

			it("should output complex errors if requested and an error occurred", function() {
				var output = {};

				var e = new Error("Some error here");
				req.fullErrors = true;

				module.httpEndpoint(req, res, e, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(500)).to.be.true;
				expect(res.json.args[0][0]).to.matchPattern({ info: "Some error here", detail: "Some error here", reqPath: "GRUNT /some/path" });

				delete req.fullErrors;
			});


			it("should construct an accurate reqPath for errors", function() {
				var creq = _.clone(req);
				creq.query = {
					foo: 1,
					bar: "moo",
					_: new Date().getTime(),
				};

				var output = {};

				var e = new Error("Some error here");

				module.httpEndpoint(creq, res, e, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(500)).to.be.true;
				expect(e.reqPath).to.equal("GRUNT /some/path?foo=1&bar=moo");
			});

			it("should populate the error info property if missing", function() {
				var output = {};

				var e = new Error("Some error here");

				module.httpEndpoint(req, res, e, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(500)).to.be.true;
				expect(e.info).to.equal("Some error here");
			});

			it("should populate the error detail property if missing", function() {
				var output = {};

				var e = new Error("Some error here");

				module.httpEndpoint(req, res, e, output);

				expect(res.json.calledAfter(res.status)).to.be.true;
				expect(res.status.calledWith(500)).to.be.true;
				expect(e.detail).to.equal("Some error here");
			});

			it("should wipe the error stack before emitting", function() {
				var output = {};

				var e = new Error("Some error here");
				e.stack = "blah blah";

				module.httpEndpoint(req, res, e, output);

				expect(e.detail).to.equal("Some error here");
			});

			it("should populate the error person property if a user was logged in with a couch ID", function() {
				var output = {};

				var creq = _.clone(req);
				creq.session = {
					user: {
						_id: "userid",
					},
				};

				var e = new Error("Some error here");

				module.httpEndpoint(creq, res, e, output);

				expect(e.person).to.equal("userid");
			});

			it("should populate the error person property if a user was logged in with a postgres ID", function() {
				var output = {};

				var creq = _.clone(req);
				creq.session = {
					user: {
						user_id: "userid",
					},
				};

				var e = new Error("Some error here");

				module.httpEndpoint(creq, res, e, output);

				expect(e.person).to.equal("userid");
			});

			it("should spit out the error with the correct code", function() {
				var output = {};

				var e = new Error("Some error here");
				e.statusCode = 403;

				module.httpEndpoint(req, res, e, output);

				expect(res.status.calledWith(403)).to.be.true;
			});

			it("should manipulate the session", function() {
				var output = {
					session: {
						set: 1,
						these: "moo",
						values: { sub: "value" },
					},
				};

				module.httpEndpoint(req, res, null, output);

				expect(req.session).to.matchPattern(output.session);
			});

			it("should add cookies", function() {
				var output = {
					cookies: {
						setme: { value: 1, options: { expires: 0 } },
					},
				};

				module.httpEndpoint(req, res, null, output);

				expect(res.cookie.calledWith("setme", 1, { expires: 0 })).to.be.true;
				expect(res.clearCookie.called).to.be.false;
			});

			it("should remove cookies", function() {
				var output = {
					cookies: {
						setme: null,
					},
				};

				module.httpEndpoint(req, res, null, output);

				expect(res.cookie.called).to.be.false;
				expect(res.clearCookie.calledWith("setme")).to.be.true;
			});

			it("should terminate the response early", function() {
				var output = {
					endResponse: true,
				};

				module.httpEndpoint(req, res, null, output);

				expect(res.status.called).to.be.true;
				expect(res.json.called).to.be.false;
				expect(res.end.called).to.be.true;
			});

			it("should write the response in raw format", function() {
				var output = {
					raw: true,
				};

				module.httpEndpoint(req, res, null, output);

				expect(res.send.calledAfter(res.status)).to.be.true;
				expect(res.json.called).to.be.false;
			});

			it("should stream the response", function() {
				var output = {
					stream: {
						pipe: sinon.spy(),
					},
				};

				module.httpEndpoint(req, res, null, output);

				expect(res.status.called).to.be.false;
				expect(res.json.called).to.be.false;
				expect(output.stream.pipe.calledWith(res)).to.be.true;
			});
		});
	});

	describe("API handler", function() {
		describe("Mocking", function() {
			it("should allow dogfooding", function(done) {
				var call = module.createApiHandler({ mockDogfood: true }, sinon.spy());

				var opts = {
					mockError: new Error("gfgfdfd"),
					mockResponse: {
						stuff: [],
					},
				};

				var cb = sinon.spy();

				call(opts, function(o, c) { cb.apply(this, arguments); });

				// This function is invoked with a callback so we need to wait for it to complete

				setTimeout(function() {
					expect(cb.calledWith(opts.mockError, opts.mockResponse)).to.be.true;
					done();
				}, 10);
			});

			it("should not dogfood excepted endpoints", function() {
				var call = module.createApiHandler({
					mockDogfood: true,
					spec: {
						moo: 1,
					},
					mockExceptions: ["moo"],
				}, sinon.spy());

				var opts = {
					mockError: 1,
					mockResponse: 2,
				};

				var callback = sinon.spy();

				call(opts, callback);

				expect(callback.calledWith(opts.mockError, opts.mockResponse)).to.be.false;
			});

			it("should allow dogfooding with a promise", function() {
				var call = module.createApiHandler({ mockDogfood: true }, sinon.spy());

				var opts = {
					mockResponse: {
						stuff: [],
					},
				};

				return Promise.resolve(call(opts)).then(r => {
					expect(r).to.matchPattern(opts.mockResponse);
				});
			});

			it("should allow dogfooding with a failed promise", function() {
				var call = module.createApiHandler({ mockDogfood: true }, sinon.spy());

				var opts = {
					mockError: new Error("gfgfdfd"),
					mockResponse: { whatever: 1 },
				};

				return Promise.resolve(call(opts)).then(r => assert(false)).catch(e => expect(e).to.be.instanceof(Error));
			});

			it("should return the raw Response when mocking and the current module is excepted and is using promises", function() {
				var spy = sinon.spy();
				var cb = function() { return Promise.resolve(module.response(2).status(201)); };
				var call = module.createApiHandler({ mockDogfood: true, mockExceptions: ["foo"], spec: { foo: {} } }, cb);

				return call({}).then(result => {
					expect(result).to.matchPattern({ result: 2, code: 201 });
				});;
			});
		});

		it("should return a callback as the last argument", function() {
			var spy = sinon.spy();
			var cb = function(opts, callback) { spy.apply(this, arguments); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(o, c) {});

			expect(spy.args[0][1]).to.be.an.instanceof(Function);
		});

		it("should invoke a callback if both functions have callbacks", function(done) {
			var spy = sinon.spy();
			var cb = function(opts, callback) { callback(null, { result: 2 }); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(o, c) {
				expect(c).to.equal(2);
				done();
			});
		});

		it("should invoke a callback if both functions have callbacks and returns a Response", function(done) {
			var spy = sinon.spy();
			var cb = function(opts, callback) { callback(null, { result: new Response(2) }); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(o, c) {
				expect(c).to.equal(2);
				done();
			});
		});


		it("should invoke a callback if both functions have callbacks and don't expect data", function(done) {
			var spy = sinon.spy();
			var cb = function(opts, callback) { callback(null, { result: 2 }); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(o) {
				expect(o).to.be.null;
				done();
			});
		});


		it("should invoke a callback if both functions have callbacks and don't send a response", function(done) {
			var spy = sinon.spy();
			var cb = function(opts, callback) { callback(null); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(o, c) {
				expect(o).to.be.null;
				expect(c).to.be.undefined;
				done();
			});
		});

		it("should invoke a callback if the source function returns a promise but the target function has a callback", function(done) {
			var spy = sinon.spy();
			var cb = function() { return Promise.resolve(2); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(o, c) {
				expect(c).to.equal(2);
				done();
			});
		});

		it("should invoke a callback if the source function returns a promise but the target function has a callback and returns a Response", function(done) {
			var spy = sinon.spy();
			var cb = function() { return Promise.resolve(new Response(2)); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(o, c) {
				expect(c).to.equal(2);
				done();
			});
		});

		it("should return a promise if both source and target functions return promises", function() {
			var cb = function(opts) { return Promise.resolve(2); };
			var call = module.createApiHandler({ }, cb);

			return Promise.resolve(call({})).then(r => {
				expect(r).to.equal(2);
			});
		});

		it("should return a promise if both source and target functions are promises and return Response", function() {
			var cb = function(opts) { return Promise.resolve(new Response(2)); };
			var call = module.createApiHandler({ }, cb);

			return Promise.resolve(call({})).then(r => {
				expect(r).to.equal(2);
			});
		});

		it("should return an error if both source and target functions return promises", function() {
			var cb = function(opts) { throw new Error("1"); };
			var call = module.createApiHandler({ }, cb);

			return Promise.resolve(call({})).then(r => assert(false)).catch(r => expect(r).to.be.an.instanceof(Error));
		});

		it("should return a promise if only the source function returns a promise", function() {
			var cb = function(opts, callback) { return callback(null, { result: 2 }); };
			var call = module.createApiHandler({ }, cb);

			return Promise.resolve(call({})).then(r => {
				expect(r).to.equal(2);
			});
		});

		it("should return a promise if only the source function returns a promise and a Response", function() {
			var cb = function(opts, callback) { return callback(null, new Response(2)); };
			var call = module.createApiHandler({ }, cb);

			return Promise.resolve(call({})).then(r => {
				expect(r).to.equal(2);
			});
		});

		it("should return an error if only the source function returns a promise", function() {
			var cb = function(opts, callback) { callback(new Error("1")); };
			var call = module.createApiHandler({ }, cb);

			return Promise.resolve(call({})).then(r => assert(false)).catch(e => expect(e).to.be.an.instanceof(Error));
		});

		it("should fail a promise if the target function throws despite providing a callback", function() {
			var cb = function(opts, callback) { throw new Error("fail"); };
			var call = module.createApiHandler({ }, cb);

			return Promise.resolve(call({})).then(() => assert(false)).catch(e => expect(e).to.be.instanceof(Error));
		});

		it("should return an error if the target function is a callback and an error throws", function(done) {
			var cb = function(opts) { throw new Error("1"); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(e, r) {
				expect(e).to.be.an.instanceof(Error);
				done();
			});
		});

		it("should return an error if the target function is a callback and an error is returned", function(done) {
			var cb = function(opts) { return Promise.reject(new Error("1")); };
			var call = module.createApiHandler({ }, cb);

			call({}, function(e, r) {
				expect(e).to.be.an.instanceof(Error);
				done();
			});
		});

		it("should detect an options object and return it", function() {
			var spy = sinon.spy(function(o, c) {});
			var call = module.createApiHandler({ }, spy);

			call({}, function(o, c) {});

			expect(spy.args[0][0]).to.matchPattern({ internal: true, multiID: true, headers: {}, query: {}, session: {}, body: {} });
			expect(spy.args[0][1]).to.be.an.instanceof(Function);
		});

		it("should flag calls as internal", function() {
			var spy = sinon.spy(function(o, c) {});
			var call = module.createApiHandler({ }, spy);

			call({}, _.noop);

			expect(spy.args[0][0].internal).to.be.true;
		});

		it("should set the uids property", function() {
			var spy = sinon.spy(function(o, c) {});
			var call = module.createApiHandler({ }, spy);

			var opts = { uid: "a" };
			call(opts, _.noop);

			expect(spy.args[0][0].uids).to.matchPattern([opts.uid]);
		});

		it("should auto-populate the opts property of the endpoint call", function() {
			var spy = sinon.spy(function(o, c) {});
			var call = module.createApiHandler({ }, spy);

			call(_.noop);

			expect(spy.args[0][0].internal).to.be.true;
		});
	});

	describe("createApiPermissionChecks", function() {
		it("should prepend API permissions with 'api' and drop the version", function() {
			var input = "/api/v1/foo/bar";

			var output = [
				"api.foo.bar.get",
			];

			expect(module.createApiPermissionChecks(input, "get")).to.matchPattern(output);
		});

		it("should not prepend api portion for regular permissions", function() {
			var input = "/foo/bar";

			var output = [
				"foo.bar.get",
			];

			expect(module.createApiPermissionChecks(input, "get")).to.matchPattern(output);
		});

		it("should convert path parameters to named options and pattern matches", function() {
			var input = "/foo/:bar/moo/:narf";

			var output = [
				"foo.bar.moo.narf.get",
				"foo._.moo._.get",
			];

			expect(module.createApiPermissionChecks(input, "get")).to.matchPattern(output);
		});

		it("should drop uid path pieces", function() {
			var input = "/foo/bar/:uid";

			var output = [
				"foo.bar.uid.get",
				"foo.bar.get",
			];

			expect(module.createApiPermissionChecks(input, "get")).to.matchPattern(output);
		});

		it("should append the verb to permissions", function() {
			var input = "/foo/bar";

			var output = [
				"foo.bar.fakeverb",
			];

			expect(module.createApiPermissionChecks(input, "fakeverb")).to.matchPattern(output);
		});
	});

	describe("buildPathPermissions", function() {
		it("should convert permission strings to an expanded permission structure", function() {
			var input = "/foo/bar/:uid";

			var output = {
				foo: {
					bar: {
						post: "foo.bar.post",
						uid: {
							post: "foo.bar.uid.post",
						},
					},
				},
			};

			expect(module.buildPathPermissions(input, "post")).to.matchPattern(output);
		});
	});

	describe("activate", function() {
		it("should assign the provided spec to the provided options", function() {
			var spec = {}, options = {};

			module.activate(spec, options);

			expect(options.spec).to.equal(spec);
		});

		it("should generate dogfooding handlers at the default location", function() {
			var spec = {
				foo: {
					derp: sinon.spy(),
				},
			};

			module.activate(spec);

			expect(module.api.latest).to.matchPattern(`{
				foo: {
					derp: {
						get: _.isFunction,
					},
				}
			}`);
			expect(module.acacia).to.matchPattern({});
		});

		it("should generate dogfooding handlers on the internal location if api is disabled", function() {
			var spec = {
				foo: {
					derp: sinon.spy(),
				},
			};

			module.activate(spec, { api: false });

			expect(module.acacia).to.matchPattern(`{
				foo: {
					derp: {
						get: _.isFunction,
					},
				}
			}`);
			expect(module.api.latest).to.matchPattern({});
		});

		it("should rename parameters to canonical names for dogfooded handlers", function() {
			var spec = {
				foo: {
					":derp": {
						":herp": {
							moo: sinon.spy(),
						},
					},
				},
			};

			module.activate(spec);

			expect(module.api.latest).to.matchPattern(`{
				foo: {
					derp: {
						herp: {
							moo: {
								get: _.isFunction,
							},
						},
					},
				}
			}`);
			expect(module.acacia).to.matchPattern({});
		});

		it("should detect all valid verbs and use them instead of GET for dogfooded handlers", function() {
			var spec = {
				foo: {
					get: sinon.spy(),
					post: sinon.spy(),
					put: sinon.spy(),
					delete: sinon.spy(),
					patch: sinon.spy(),
				},
				moo: {
					"get+": sinon.spy(),
					"put-": sinon.spy(),
				},
			};

			module.activate(spec);

			expect(module.api.latest).to.matchPattern(`{
				foo: {
					get: _.isFunction,
					post: _.isFunction,
					put: _.isFunction,
					delete: _.isFunction,
					patch: _.isFunction,
				},
				moo: {
					get: _.isFunction,
					put: _.isFunction,
				}
			}`);
		});

		it("should upgrade the del verb to delete", function() {
			var spec = {
				foo: {
					del: sinon.spy(),
				},
			};

			module.activate(spec);

			expect(module.api.latest).to.matchPattern(`{
				foo: {
					delete: _.isFunction,
				}
			}`);
		});

		it("should downgrade the get+ verb to get", function() {
			var spec = {
				foo: {
					"get+": sinon.spy(),
				},
			};

			module.activate(spec);

			expect(module.api.latest).to.matchPattern(`{
				foo: {
					get: _.isFunction,
				}
			}`);
		});

		it("should downgrade the put- verb to put", function() {
			var spec = {
				foo: {
					"put-": sinon.spy(),
				},
			};

			module.activate(spec);

			expect(module.api.latest).to.matchPattern(`{
				foo: {
					put: _.isFunction,
				}
			}`);
		});

		it("should apply all generated paths to the provided server object", function() {
			var opts = {
				server: {
					get: sinon.spy(),
				},
				passport: {

				},
			};

			module.init(opts);

			var spec = {
				foo: {
					":moo": sinon.spy(),
				},
			};

			module.activate(spec);

			expect(opts.server.get.calledWith("/api/v1/foo/:moo", module.Pylor.sslOff, sinon.match.func, module.httpBasic, module.Pylor.checkPermission), sinon.match.func).to.be.true;
		});

		describe("Verb mappings", function() {
			it("should map get+", function() {
				var opts = {
					server: {
						get: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						"get+": sinon.spy(),
					},
				};

				module.activate(spec);

				expect(opts.server.get.calledWith("/api/v1/foo")).to.be.true;
				expect(opts.server.get.calledWith("/api/v1/foo/:uid")).to.be.true;
			});

			it("should map get", function() {
				var opts = {
					server: {
						get: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						get: sinon.spy(),
					},
				};

				module.activate(spec);

				expect(opts.server.get.calledWith("/api/v1/foo")).to.be.true;
				expect(opts.server.get.calledWith("/api/v1/foo/:uid")).to.be.false;
			});

			it("should prefer lowest GET definition that satisfies", function() {
				var opts = {
					server: {
						get: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						"get+": sinon.spy(),
						get: sinon.spy(),
					},
				};

				module.activate(spec);

				module.api.latest.foo.get({}, function() { });
				expect(spec.foo.get.called).to.be.true;
				expect(spec.foo["get+"].called).to.be.false;
			});

			it("should map post", function() {
				var opts = {
					server: {
						post: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						post: sinon.spy(),
					},
				};

				module.activate(spec);

				expect(opts.server.post.calledWith("/api/v1/foo")).to.be.true;
				expect(opts.server.post.calledWith("/api/v1/foo/:uid")).to.be.false;
			});

			it("should map put", function() {
				var opts = {
					server: {
						put: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						put: sinon.spy(),
					},
				};

				module.activate(spec);

				expect(opts.server.put.calledWith("/api/v1/foo")).to.be.false;
				expect(opts.server.put.calledWith("/api/v1/foo/:uid")).to.be.true;
			});

			it("should map put-", function() {
				var opts = {
					server: {
						put: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						"put-": sinon.spy(),
					},
				};

				module.activate(spec);

				expect(opts.server.put.calledWith("/api/v1/foo/:uid")).to.be.false;
				expect(opts.server.put.calledWith("/api/v1/foo")).to.be.true;
			});

			it("should map delete", function() {
				var opts = {
					server: {
						delete: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						delete: sinon.spy(),
					},
				};

				module.activate(spec);

				expect(opts.server.delete.calledWith("/api/v1/foo/:uid")).to.be.true;
				expect(opts.server.delete.calledWith("/api/v1/foo")).to.be.false;
			});

			it("should map patch", function() {
				var opts = {
					server: {
						patch: sinon.spy(),
					},
				};

				module.init(opts);

				var spec = {
					foo: {
						patch: sinon.spy(),
					},
				};

				module.activate(spec);

				expect(opts.server.patch.calledWith("/api/v1/foo/:uid")).to.be.true;
				expect(opts.server.patch.calledWith("/api/v1/foo")).to.be.false;
			});
		});

		it("should enable an SSL check", function() {
			var opts = {
				server: {
					get: sinon.spy(),
				},
				ssl: true,
			};

			module.init(opts);

			var spec = {
				foo: {
					":moo": sinon.spy(),
				},
			};

			module.activate(spec);

			expect(opts.server.get.calledWith("/api/v1/foo/:moo", module.Pylor.sslOn, sinon.match.func, module.Pylor.checkPermission), sinon.match.func).to.be.true;
		});

		it("should enable an SSL check", function() {
			var opts = {
				server: {
					get: sinon.spy(),
				},
				ssl: true,
			};

			module.init(opts);

			var spec = {
				foo: {
					":moo": sinon.spy(),
				},
			};

			module.activate(spec);

			expect(opts.server.get.calledWith("/api/v1/foo/:moo", module.Pylor.sslOn, sinon.match.func, module.Pylor.checkPermission), sinon.match.func).to.be.true;
		});

		it("should extend cached permissions with the generated permissions for the current path", function() {
			var opts = {
				server: {
					get: sinon.spy(),
				},
				ssl: true,
			};

			module.init(opts);

			var spec = {
				foo: {
					"moo": sinon.spy(),
				},
			};

			module.activate(spec);

			expect(module.getRolePermissions()).to.matchPattern({
				api: {
					foo: {
						moo: {
							get: "api.foo.moo.get",
						},
					},
				},
			});

			expect(module.p).to.matchPattern({
				api: {
					foo: {
						moo: {
							get: "api.foo.moo.get",
						},
					},
				},
			});
		});

		it("should extend the server calls with inline middlewares", function() {
			var opts = {
				server: {
					get: sinon.spy(),
				},
			};

			module.init(opts);

			var mware1 = sinon.spy();
			var mware2 = sinon.spy();
			var spec = {
				foo: {
					"moo": [mware1, mware2, sinon.spy()],
				},
			};

			module.activate(spec);

			expect(opts.server.get.calledWith("/api/v1/foo/moo", module.Pylor.sslOff, sinon.match.func, mware1, mware2, module.Pylor.checkPermission, sinon.match.func)).to.be.true;
		});

		it("should extend the server calls with defined middlewares before inline middleware", function() {
			var mware1 = sinon.spy();
			var mware2 = sinon.spy();

			var opts = {
				server: {
					get: sinon.spy(),
				},
			};

			module.init(opts);

			var spec = {
				foo: {
					_middleware: [mware1],
					"moo": [mware2, sinon.spy()],
				},
			};

			module.activate(spec);

			expect(opts.server.get.calledWith("/api/v1/foo/moo", module.Pylor.sslOff, sinon.match.func, mware1, mware2, module.Pylor.checkPermission, sinon.match.func)).to.be.true;
		});
	});
});