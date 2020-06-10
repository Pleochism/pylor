/* global describe, it, before, beforeEach, after, afterEach */

var sinon = require("sinon");
var chai = require("chai");
chai.use(require("chai-match-pattern"));

var utils = require("../lib/utilities");

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

var module;

describe("Pylor", function() {
	before(function() {
		module = require("../lib/pylor");
	});

	beforeEach(function() {
		module.reset();
	});

	it("should convert a role into a fully qualified hierarchy of permissions with resolveRole()", function() {
		var role1 = {
			permissions: [
				"some.permissions",
				"some.more.permissions",
				"other.permissions",
				"foo.*",
				"foo.nerf",
				"foo.this.must.not.appear",
				"!foo.bar",
				"zlop.clop.blop",
				"zlop.blop.clop",
				"zlop.zlop.zlop",
				"!narf",
			],
		};

		var answer1 = {
			plus: {
				some: {
					permissions: null,
					more: {
						permissions: null,
					},
				},
				other: {
					permissions: null,
				},
				foo: {
					"*": null,
				},
				zlop: {
					clop: {
						blop: null,
					},
					blop: {
						clop: null,
					},
					zlop: {
						zlop: null,
					}
				},
			},
			minus: {
				narf: null,
				foo: {
					bar: null,
				},
			},
			superminus: {},
			superplus: {},
		};

		expect(module.resolveRole(role1)).to.matchPattern(answer1);
	});

	it("should reset properly", function() {
		module.roles = module.grants = module.permissions = { foo: 1 };
		module.reset();

		expect(module.roles).to.matchPattern({});
		expect(module.permissions).to.matchPattern({});
		expect(module.grants).to.matchPattern({});
	});

	describe("init", function() {
		var opts = {
			roles: {
				"foo": {
					permissions: [
						"wut",
						"lut",
					],
				},
				bar: {
					permissions: [],
				}
			},
			permissions: [
				"narf",
			],
			grants: {
				"bob": {
					grant: "bob",
				}
			}
		};

		beforeEach(function() {
			module.init(opts);
		});

		it("should assign the roles", function() {
			expect(module.roles).to.equal(opts.roles);
		});

		it("should assign the grants", function() {
			expect(module.grants).to.equal(opts.grants);
		});

		it("should assign the permissions", function() {
			expect(module.permissions).to.matchPattern({ foo: module.resolveRole(opts.roles.foo), bar: { plus: {}, minus: {}, superminus: {}, superplus: {} } });
		});
	});

	describe("Access extensions", function() {
		var opts = {
			roles: {
				"role": {
					permissions: [
						"foo",
					],
				},
			},
			permissions: [
				"foo",
			],
		};

		var user = {
			roles: ["role"],
		};

		beforeEach(function() {
			module.init(opts);
		});

		it("should be able to register multiple access extensions to extend a given permission", function() {
			expect(module.hasAccess("boo", user)).to.be.false;

			module.registerAccessExtension("boo", () => false);
			module.registerAccessExtension("boo", () => true);

			expect(module.hasAccess("boo", user)).to.be.true;
		});

		it("should be able to ignore extensions", function() {
			expect(module.hasAccess("boo", user)).to.be.false;

			module.registerAccessExtension("boo", () => true);

			expect(module.hasAccess("boo", user, true)).to.be.false;
		});
	});

	describe("Grant extensions", function() {
		var opts = {
			roles: {
				"role": {
					permissions: [
						"foo",
						"grants.main.bob",
					],
				},
			},
			permissions: [
				"foo",
			],
			grants: utils.mapGrants({
				bob: {

				},
				pete: {

				},
			}),
		};

		var user = {
			roles: ["role"],
			grants: {
				bob: [1,2],
				joe: ["a", "b"],
			},
		};

		beforeEach(function() {
			module.init(opts);
		});

		it("should be able to register multiple grant extensions to extend a given grant", function() {
			module.registerGrantExtension("bob", () => [2,3,4]);
			module.registerGrantExtension("bob", () => ["a"]);

			expect(module.getGrantValues("bob", user)).to.matchPattern([1,2,2,3,4,"a"]);
		});

		it("should be able to register grant extensions with objects", function() {
			module.registerGrantExtension({ grant: "bob" }, () => [2,3,4]);

			expect(module.getGrantValues("bob", user)).to.matchPattern([1,2,2,3,4]);
		});

		it("should fail to register grants if the grant is blank", function() {
			expect(module.registerGrantExtension.bind(module, {}, () => [2,3,4])).to.throw(Error);
		});

		it("should be able to ignore extensions", function() {
			module.registerGrantExtension("bob", () => [2,3,4]);

			expect(module.getGrantValues("bob", user, true)).to.matchPattern([1,2]);
		});

		it("should treat a null response from an extension as full access when using matchGrantValue", function() {
			module.registerGrantExtension("bob", () => null);

			expect(module.matchGrantValues("bob", user, "blerp")).to.be.true;
		});

		it("should pass extra values through to grant extensions", function() {
			module.registerGrantExtension("bob", (user, extra) => {
				if(extra)
					return null;
				return [];
			});

			expect(module.matchGrantValues("bob", user, "blerp")).to.be.false;
			expect(module.matchGrantValues("bob", user, "blerp", true)).to.be.true;
		});
	});

	describe("hasAccess", function() {
		it("should fail if no check is provided", function() {
			expect(module.hasAccess).to.throw(Error);
		});

		it("should fail if no user is provided", function() {
			expect(module.hasAccess.bind(module, {})).to.throw(Error);
		});

		it("should fail if the supplied user has no roles", function() {
			expect(module.hasAccess.bind(module, {}, {})).to.throw(Error);
		});

		it("should add the default role to the supplied user's roles", function() {
			var opts = {
				roles: {
					"*": {
						permissions: [
							"perm",
							"one.two",
						],
					},
				},
			};

			module.init(opts);

			expect(module.hasAccess(["perm"], { roles: [] })).to.be.true;
		});

		it("should work with string permissions", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm.herm.burn",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("perm.herm.burn", { roles: ["role"] })).to.be.true;
		});

		it("should work with an array of permissions", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess(["perm"], { roles: ["role"] })).to.be.true;
		});

		it("should prefer only permissions on objects if at least one exists", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess({ any: ["perm"], only: ["beehive"] }, { roles: ["role"] })).to.be.false;
			expect(module.hasAccess({ any: ["perm"], only: [] }, { roles: ["role"] })).to.be.true;
		});

		it("should require all .only permissions to match", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm",
							"flurm",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess({ only: ["perm", "beehive"] }, { roles: ["role"] })).to.be.false;
			expect(module.hasAccess({ only: ["perm", "flurm"] }, { roles: ["role"] })).to.be.true;
		});

		it("should use any permissions if at least one is present", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess({ any: ["perm"] }, { roles: ["role"] })).to.be.true;
			expect(module.hasAccess({ any: [] }, { roles: ["role"] })).to.be.false;
		});

		it("should return false by default", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess({ }, { roles: ["role"] })).to.be.false;
		});

		it("should return true if the permission matches a wildcard", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm.berm.*",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("perm.berm.ferm", { roles: ["role"] })).to.be.true;
		});

		it("should allow wildcards in check permissions", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm.berm.*",
							"perm.term",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("perm.*", { roles: ["role"] })).to.be.true;
			expect(module.hasAccess("perm.term.*", { roles: ["role"] })).to.be.false;
		});

		it("should prefer negated permissions over regular permissions", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm.berm.nope",
							"!perm.berm.nope",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("perm.berm.nope", { roles: ["role"] })).to.be.false;
		});

		it("should prefer negated permissions over regular permissions across roles", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm.berm.nope",
						],
					},
					"role2": {
						permissions: [
							"!perm.berm.nope",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("perm.berm.nope", { roles: ["role", "role2"] })).to.be.false;
			expect(module.hasAccess("perm.berm.nope", { roles: ["role2", "role"] })).to.be.false;
		});

		it("should prefer wildcard checks over regular negated permissions", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"perm.berm.*",
							"!perm.berm.nope",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("perm.berm.*", { roles: ["role"] })).to.be.true;
		});

		it("should prefer wildcard checks over regular negated permissions across roles", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"!api.epubs.choices.get",
						],
					},
					"role2": {
						permissions: [
							"api.epubs.*",
						],
					}
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("api.epubs.choices.get", { roles: ["role", "role2"] })).to.be.true;
		});

		it("should prefer strongly negated permissions over wildcard checks", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"zilch.*",
							"!!zilch.blarg",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("zilch.*", { roles: ["role"] })).to.be.true;
			expect(module.hasAccess("zilch.blarg", { roles: ["role"] })).to.be.false;
		});

		it("should prefer strongly negated permissions over wildcard checks with placeholders", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"api.epubs._.*",
							"!!api.epubs.choices.*",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			//expect(module.hasAccess("api.epubs.choices.moo", { roles: ["role"] })).to.be.true;
			expect(module.hasAccess("api.epubs.choices.get", { roles: ["role"] })).to.be.false;
		});

		it("should prefer negated wildcard permissions over wildcard checks", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"!zilch.*",
							"zilch.*",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("zilch.*", { roles: ["role"] })).to.be.false;
			expect(module.hasAccess("zilch.hi", { roles: ["role"] })).to.be.false;
		});

		it("should prefer negated wildcard permissions over wildcard checks across roles", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"!zilch.*",
						],
					},
					"role2": {
						permissions: [
							"zilch.*",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("zilch.*", { roles: ["role", "role2"] })).to.be.false;
			expect(module.hasAccess("zilch.*", { roles: ["role2", "role"] })).to.be.false;
			expect(module.hasAccess("zilch.hi", { roles: ["role", "role2"] })).to.be.false;
			expect(module.hasAccess("zilch.hi", { roles: ["role2", "role"] })).to.be.false;
		});

		it("should prefer superplus permissions over everything except hard negation", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"!zilch.*",
							"!!zilch.foo",
						],
					},
					"role2": {
						permissions: [
							"+zilch.moo",
							"+zilch.foo",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("zilch.*", { roles: ["role", "role2"] })).to.be.false;
			expect(module.hasAccess("zilch.*", { roles: ["role2", "role"] })).to.be.false;
			expect(module.hasAccess("zilch.hi", { roles: ["role", "role2"] })).to.be.false;
			expect(module.hasAccess("zilch.hi", { roles: ["role2", "role"] })).to.be.false;
			expect(module.hasAccess("zilch.moo", { roles: ["role", "role2"] })).to.be.true;
			expect(module.hasAccess("zilch.moo", { roles: ["role2", "role"] })).to.be.true;
			expect(module.hasAccess("zilch.foo", { roles: ["role", "role2"] })).to.be.false;
			expect(module.hasAccess("zilch.foo", { roles: ["role2", "role"] })).to.be.false;
		});

		it("should allow pattern matching", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"some.perms",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("some._", { roles: ["role"] })).to.be.true;
		});

		it("should allow patterns at any position", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"some.perms.go.here",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("some._.go._", { roles: ["role"] })).to.be.true;
		});

		it("should search all possible paths if there is pattern ambiguity", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"some.perms",
							"narf.barf",
							"_.warf",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("_.warf", { roles: ["role"] })).to.be.true;
			expect(module.hasAccess("_.some", { roles: ["role"] })).to.be.false;
		});

		it("should fail if there is no exact permission match", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"some.really.long.permissions.here",
							"narf.barf",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("narf", { roles: ["role"] })).to.be.false;
		});

		it("should allow wildcards in permissions", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"some._.matches",
							"herp._._.woot",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("some.thing.matches", { roles: ["role"] })).to.be.true;
			expect(module.hasAccess("herp.derp.flerp", { roles: ["role"] })).to.be.false;
		});

		it("should prioritise fixed values over patterns", function() {
			var opts = {
				roles: {
					"role": {
						permissions: [
							"api.freeform._.get",
							"api.freeform.since._.get",
						],
					},
				},
				permissions: [],
			};

			module.init(opts);

			expect(module.hasAccess("api.freeform.since.moo.get", { roles: ["role"] })).to.be.true;
			expect(module.hasAccess("api.freeform.derp.get", { roles: ["role"] })).to.be.true;
		});
	});

	describe("Grants", function() {
		var opts = {
			roles: {
				"role": {
					permissions: [
						"grants.main.bob",
						"grants.main.joe",
						"grants.all.pete",
					],
				},
			},
			permissions: {

			},
			grants: utils.mapGrants({
				"bob": {
					"name": "Bob",
				},
				"pete": {
					"name": "Pete",
				},
				"joe": {
					"name": "Joe",
				},
				"uniq": {
					"name": "Unique",
				},
				"herp": {
					name: "herp",
				},
				"full": {
					name: "full",
				},
			}),
		};

		var user = {
			roles: ["role"],
			grants: {
				bob: [
					1
				],
				pete: [
					2
				],
				joe: [
					3
				],
				narf: [
					4
				],
				herp: ["a"],
				full: [
					1
				],
			},
		};

		beforeEach(function() {
			module.init(opts);
		});

		describe("hasGrantAccess", function() {
			it("should fail if no grant is provided", function() {
				expect(module.hasGrantAccess).to.throw(Error);
			});

			it("should fail if no user is provided", function() {
				expect(module.hasGrantAccess.bind(module, "grant")).to.throw(Error);
			});

			it("should fail if the provided user has no roles", function() {
				expect(module.hasGrantAccess.bind(module, "grant", {})).to.throw(Error);
			});

			it("should pass if the user has full access to a grant", function() {
				expect(module.hasGrantAccess("pete", user)).to.be.true;
				expect(module.hasGrantAccess("narf", user)).to.be.false;
			});

			it("should pass if the user has main access to a grant", function() {
				expect(module.hasGrantAccess("joe", user)).to.be.true;
			});

			it("should pass if the user has full access to a grant and the grant is an object", function() {
				expect(module.hasGrantAccess(opts.grants.pete, user)).to.be.true;
				expect(module.hasGrantAccess(opts.grants.uniq, user)).to.be.false;
			});

			it("should pass if the user has main access to a grant", function() {
				expect(module.hasGrantAccess(opts.grants.joe, user)).to.be.true;
			});

			it("should fail if the grant object has no grant", function() {
				expect(module.hasGrantAccess.bind(module, {}, user)).to.throw(Error);
			});
		});

		describe("matchGrantValues", function() {
			it("should fail if no grant is provided", function() {
				expect(module.matchGrantValues).to.throw(Error);
			});

			it("should fail if no user is provided", function() {
				expect(module.matchGrantValues.bind(module, "grant")).to.throw(Error);
			});

			it("should fail if the provided user has no roles", function() {
				expect(module.matchGrantValues.bind(module, "grant", {})).to.throw(Error);
			});

			it("should fail if the grant object has no grant", function() {
				expect(module.matchGrantValues.bind(module, {}, user)).to.throw(Error);
			});

			it("should pass if the user has full access for a grant irrespective of the value and the grant is a string", function() {
				expect(module.matchGrantValues("pete", user, "arbitrary")).to.be.true;
			});

			it("should pass if the user has full access for a grant irrespective of the value and the grant is an object", function() {
				expect(module.matchGrantValues(opts.grants.pete, user, "arbitrary")).to.be.true;
			});

			it("should fail if the check is null and the user does not have full permissions", function() {
				expect(module.matchGrantValues(opts.grants.bob, user, null)).to.be.false;
			});

			it("should succeed if the check is null and the user does not have full permissions", function() {
				expect(module.matchGrantValues(opts.grants.bob, user, null)).to.be.false;
			});

			it("should fail if the user does not have main access for a grant and the grant is a string", function() {
				expect(module.matchGrantValues("narf", user, "arbitrary")).to.be.false;
			});

			it("should fail if the user has main access for a grant and the grant is an object", function() {
				expect(module.matchGrantValues(opts.grants.uniq, user, "arbitrary")).to.be.false;
			});

			it("should pass if the user has main access for a single grant value", function() {
				expect(module.matchGrantValues("bob", user, 1)).to.be.true;
				expect(module.matchGrantValues("bob", user, 2)).to.be.false;
			});

			it("should pass if the user has main access for a grant value array", function() {
				expect(module.matchGrantValues("bob", user, [1, 2])).to.be.true;
				expect(module.matchGrantValues("bob", user, [2, 3, 4])).to.be.false;
			});
		});

		describe("getGrantValues", function() {
			it("should fail if no grant is provided", function() {
				expect(module.getGrantValues).to.throw(Error);
			});

			it("should fail if no user is provided", function() {
				expect(module.getGrantValues.bind(module, "grant")).to.throw(Error);
			});

			it("should fail if the provided user has no grants", function() {
				expect(module.getGrantValues("bob", { roles: [] })).to.matchPattern([]);
			});

			it("should fail if the provided user has no roles", function() {
				expect(module.getGrantValues.bind(module, "bob", { grants: {} })).to.throw(Error);
			});

			it("should fail if the provided grant object has no 'grant' property", function() {
				expect(module.getGrantValues.bind(module, {}, user)).to.throw(Error);
			});

			it("should fail if the provided grant object has a falsy 'grant' property", function() {
				expect(module.getGrantValues.bind(module, { grant: "" }, user)).to.throw(Error);
			});

			it("should succeed with a string grant value", function() {
				expect(module.getGrantValues("bob", user)).to.matchPattern(user.grants.bob);
			});

			it("should succeed with an object grant value", function() {
				expect(module.getGrantValues(opts.grants.bob, user)).to.matchPattern(user.grants.bob);
			});

			it("should fail if the grant does not exist", function() {
				expect(module.getGrantValues.bind(module, "blublublu", user)).to.throw(Error);
			});

			it("should use an empty array if the specified grant goes not exist for the user", function() {
				expect(module.getGrantValues("uniq", user)).to.matchPattern([]);
			});

			it("should return null if the user has full access for the grant", function() {
				expect(module.getGrantValues("pete", user)).to.be.null;
			});

			it("should not return values for grants the user has no permission", function() {
				expect(module.getGrantValues("herp", user)).to.matchPattern([]);
			});

			it("should short-circuit if an extension returns full access", function() {
				module.registerGrantExtension("full", () => [1,2]);
				module.registerGrantExtension("full", () => null);
				expect(module.getGrantValues("full", user)).to.be.null;
			});
		});
	});

	describe("Middleware", function() {
		describe("checkPermission", function() {
			var res, hasAccessOld;

			before(function() {
				module.reset();
				module.init({
					permissions: [],
					roles: {
						"*": {
							permissions: [
								"derp",
							],
						},
						"role": {
							permissions: [
								"moo",
							],
						},
					},
					grants: {
						"bob": {
							grant: "bob",
						}
					},
					log: {
						warn: sinon.spy(),
					},
				});
			});

			beforeEach(function() {
				res = {
					status: function() {
						return res;
					},
					json: function() {
						return res;
					},
					statusCode: 200,
				};

				sinon.spy(res, "status");
				sinon.spy(res, "json");

				hasAccessOld = module.hasAccess;
				module.hasAccess = sinon.spy();

				module.log.warn.reset();
			});

			afterEach(function() {
				module.hasAccess = hasAccessOld;
			});

			it("should handle a missing .pylor property", function() {
				var next = sinon.spy();
				module.checkPermission({ }, res, next);

				expect(next.calledOnce).to.be.true;
			});

			it("should fail if SSL is expected and not provided", function() {
				var next = sinon.spy();
				module.checkPermission({ pylor: { ssl: true } }, res, next);

				expect(next.called).to.be.false;
				expect(module.log.warn.called).to.be.true;
				expect(res.status.calledWith(403)).to.be.true;
				expect(res.json.calledOnce).to.be.true;
			});

			it("should not log if SSL is expected and not provided", function() {
				var next = sinon.spy();
				module.checkPermission({ pylor: { noLog: true, ssl: true } }, res, next);

				expect(module.log.warn.called).to.be.false;
			});

			it("should skip actions if no permissions are provided", function() {
				var next = sinon.spy();
				module.checkPermission({ pylor: { ssl: false } }, res, next);

				expect(next.calledOnce).to.be.true;
				expect(module.hasAccess.calledOnce).to.be.false;
			});

			it("should do a permission check if the user is logged in", function() {
				var next = sinon.spy();
				module.hasAccess = sinon.stub().returns(true);
				module.checkPermission({ pylor: { ssl: false, any: ["moo"] }, session: { user: { roles: ["role"] } } }, res, next);

				expect(next.calledAfter(module.hasAccess)).to.be.true;
			});

			it("should fail the call if the permission check fails", function() {
				var next = sinon.spy();
				module.hasAccess = sinon.stub().returns(false);
				module.checkPermission({ route: { path: "" }, pylor: { ssl: false, any: ["moo"] }, session: { user: { roles: ["role"] } } }, res, next);

				expect(next.called).to.be.false;
				expect(module.log.warn.called).to.be.true;
				expect(module.hasAccess.calledOnce).to.be.true;
				expect(res.status.calledWith(403)).to.be.true;
				expect(res.json.calledOnce).to.be.true;
			});

			it("should not log if it fails the call if the permission check fails", function() {
				var next = sinon.spy();
				module.hasAccess = sinon.stub().returns(false);
				module.checkPermission({ route: { path: "" }, pylor: { noLog: true, ssl: false, any: ["moo"] }, session: { user: { roles: ["role"] } } }, res, next);

				expect(module.log.warn.called).to.be.false;
			});

			it("should check the default role if the user is not logged in", function() {
				var next = sinon.spy();
				module.hasAccess = sinon.stub().returns(true);
				module.checkPermission({ pylor: { noLog: true, ssl: false, any: ["derp"] } }, res, next);

				expect(next.calledAfter(module.hasAccess)).to.be.true;
			});

			it("should fail if the user is not logged in and the access check fails", function() {
				var next = sinon.spy();
				module.hasAccess = sinon.stub().returns(false);
				module.checkPermission({ route: { path: "" }, pylor: { ssl: false, any: ["derp"] } }, res, next);

				expect(next.called).to.be.false;
				expect(module.log.warn.called).to.be.true;
				expect(res.status.calledWith(401)).to.be.true;
				expect(res.json.calledOnce).to.be.true;
			});

			it("should not log if the user is not logged in and the access check fails", function() {
				var next = sinon.spy();
				module.hasAccess = sinon.stub().returns(false);
				module.checkPermission({ route: { path: "" }, pylor: { noLog: true, ssl: false, any: ["derp"] } }, res, next);

				expect(module.log.warn.called).to.be.false;
			});
		});

		it("should toggle SSL on when the sslOn() middleware is used", function() {
			var next = sinon.spy();
			var req = { pylor: { } };
			module.sslOn(req, { }, next);

			expect(next.called).to.be.true;
			expect(req.pylor).to.matchPattern({ ssl: true });
		});

		it("should toggle SSL on when the sslOn() middleware is used without a pre-existing pylor property", function() {
			var next = sinon.spy();
			var req = {};
			module.sslOn(req, { }, next);

			expect(next.called).to.be.true;
			expect(req.pylor).to.matchPattern({ ssl: true });
		});

		it("should toggle SSL off when the sslOff() middleware is used", function() {
			var next = sinon.spy();
			var req = { pylor: { ssl: true } };
			module.sslOff(req, { }, next);

			expect(next.called).to.be.true;
			expect(req.pylor).to.matchPattern({ });
		});

		it("should toggle SSL off when the sslOff() middleware is used without a pre-existing pylor property", function() {
			var next = sinon.spy();
			var req = {};
			module.sslOff(req, { }, next);

			expect(next.called).to.be.true;
			expect(req).to.matchPattern({ });
		});

		describe("any()", function() {
			it("should return the permissions if no next is provided", function() {
				var func = module.any("moo");
				expect(func({}, {})).to.matchPattern({ any: ["moo"] });
			});

			it("should set the permissions and call next if next is provided", function() {
				var func = module.any("moo");
				var next = sinon.spy();

				var req = {};
				var res = {};
				func(req, res, next);

				expect(next.called).to.be.true;
				expect(req.pylor).to.matchPattern({ ssl: false, any: ["moo"] });
			});

			it("should not set the permissions if there are pre-existing .only permissions", function() {
				var func = module.any("moo");
				var next = sinon.spy();

				var req = { pylor: { only: ["foo"] } };
				var res = {};
				func(req, res, next);

				expect(next.called).to.be.true;
				expect(req.pylor).to.matchPattern({ only: ["foo"] });
			});

			it("should combine the permissions if there are pre-existing .any permissions", function() {
				var func = module.any("moo");
				var next = sinon.spy();

				var req = { pylor: { any: ["foo"] } };
				var res = {};
				func(req, res, next);

				expect(next.called).to.be.true;
				expect(req.pylor).to.matchPattern({ any: ["foo", "moo"] });
			});

			it("should destroy existing permissions if override is set", function() {
				var func = module.any("moo", true);
				var req = { pylor: { only: ["derp"] }};
				var next = sinon.spy();
				func(req, {}, next);
				expect(next.calledOnce).to.be.true;
				expect(req).to.matchPattern({ pylor: { any: ["moo"], ssl: false } });
			});
		});

		describe("only()", function() {
			it("should return the permissions if no next is provided", function() {
				var func = module.only("moo");
				expect(func({}, {})).to.matchPattern({ only: ["moo"] });
			});

			it("should set the permissions and call next if next is provided", function() {
				var func = module.only("moo");
				var next = sinon.spy();

				var req = {};
				var res = {};
				func(req, res, next);

				expect(next.called).to.be.true;
				expect(req.pylor).to.matchPattern({ ssl: false, only: ["moo"] });
			});

			it("should override any existing .any permissions", function() {
				var func = module.only("moo");
				var next = sinon.spy();

				var req = { pylor: { any: ["foo"] } };
				var res = {};
				func(req, res, next);

				expect(next.called).to.be.true;
				expect(req.pylor).to.matchPattern({ only: ["moo"] });
			});

			it("should combine the permissions if there are pre-existing .only permissions", function() {
				var func = module.only("moo");
				var next = sinon.spy();

				var req = { pylor: { only: ["foo"] } };
				var res = {};
				func(req, res, next);

				expect(next.called).to.be.true;
				expect(req.pylor).to.matchPattern({ only: ["foo", "moo"] });
			});

			it("should destroy existing permissions if override is set", function() {
				var func = module.only("moo", true);
				var req = { pylor: { only: ["derp"] }};
				var next = sinon.spy();
				func(req, {}, next);
				expect(next.calledOnce).to.be.true;
				expect(req).to.matchPattern({ pylor: { only: ["moo"], ssl: false } });
			});
		});

		it("should clear all existing permissions when using the all() middleware", function() {
			var req = {
				pylor: {
					any: [],
					only: [],
				},
			};
			var next = sinon.spy();

			module.all(req, {}, next);

			expect(next.called).to.be.true;
			expect(req).to.matchPattern({ pylor: {} });
		});

		it("should do nothing when using the all() middleware and no permissions exist", function() {
			var req = {
				pylor: { },
			};
			var next = sinon.spy();

			module.all(req, {}, next);

			expect(next.calledOnce).to.be.true;
			expect(req).to.matchPattern({ pylor: {} });
		});

		it("should short circuit if there's no pylor object", function() {
			var req = {

			};
			var next = sinon.spy();

			module.all(req, {}, next);

			expect(next.calledOnce).to.be.true;
			expect(req).to.matchPattern({ });
		});

		it("should set noLog", function() {
			var next = sinon.spy();
			var req = {};
			module.noLog(req, { }, next);

			expect(next.called).to.be.true;
			expect(req.pylor).to.matchPattern({ noLog: true });
		});

		it("should set noLog if pylor is missing", function() {
			var next = sinon.spy();
			var req = { pylor: {} };
			module.noLog(req, { }, next);

			expect(next.called).to.be.true;
			expect(req.pylor).to.matchPattern({ noLog: true });
		});
	});
});