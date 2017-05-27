/* global describe, it, before, beforeEach, after, afterEach */

var sinon = require("sinon");
var chai = require("chai");
chai.use(require("chai-match-pattern"));

var expect = chai.expect;
var assert = chai.assert;

var utils = require("../lib/utilities");

describe("Utilities", function() {
	it("should compact() arrays by removing falsy values", function() {
		expect(utils.compact(["", null, undefined, 0])).to.matchPattern([]);
		expect(utils.compact([null, [], "z", 89, {}])).to.matchPattern([[], "z", 89, {}]);
	});

	it("should union() zero arrays and return an empty array", function() {
		expect(utils.union()).to.matchPattern([]);
	});

	it("should union() one array by combining all unique elements into a new array", function() {
		expect(utils.union([1,2,3,3])).to.matchPattern([1,2,3]);
	});

	it("should union() two arrays by combining all unique elements into a new array", function() {
		expect(utils.union([1,2,3],[2,3,4])).to.matchPattern([1,2,3,4]);
	});

	it("should union() three arrays by combining all unique elements into a new array", function() {
		expect(utils.union([1,2,3],[3,4,5],["a", "b", 1])).to.matchPattern([1,2,3,4,5,"a","b"]);
	});

	it("should not union() the 4th+ array argument", function() {
		expect(utils.union([1], [2], [3], [4], [5], [6], [7])).to.matchPattern([1,2,3]);
	});

	it("should flatten() a potentially jagged array of arbitrary depth to a single level", function() {
		expect(utils.flatten([1,2,3])).to.matchPattern([1,2,3]);
		expect(utils.flatten([1,2,3, [4]])).to.matchPattern([1,2,3,4]);
	});

	it("should flatten() deeply nested arrays to a single level", function() {
		expect(utils.flatten([1,2,3, [4, [5]]])).to.matchPattern([1,2,3,4,5]);
		expect(utils.flatten([1,2,3,[[[[[[[[[[4]]]]]]]]]], [[5,6]]])).to.matchPattern([1,2,3,4,5,6]);
	});

	it("should return true from some() if any element passes the predicate", function() {
		expect(utils.some([1,2,3], function(x) { return x > 1; })).to.be.true;
		expect(utils.some(["b", "a"], function(x) { return x === "a"; })).to.be.true;
	});

	it("should return false from some() if none of the elements pass the predicate", function() {
		expect(utils.some([1,2,3], function(x) { return x > 1000; })).to.be.false;
	});

	it("should return false from every() if any element fails the predicate", function() {
		expect(utils.every([1001,2000,300], function(x) { return x > 1000; })).to.be.false;
	});

	it("should return true from every() if all the elements pass the predicate", function() {
		expect(utils.every([1,2,3], function(x) { return x > 0; })).to.be.true;
	});

	it("should extend() an object with another object's own properties at the top level, preferring the second object", function() {
		expect(utils.extend({a: 1, b: 2, o: { some: { nested: "thing" } }}, {a: 3, c: 4, o: { a: { different: "thing" } }})).to.matchPattern({ a: 3, b: 2, c: 4, o: { a: { different: "thing" } }});
	});

	describe("merge()", function() {
		var input1 = {
			o: {
				some: { nested: "thing" },
				a: { different: "thang" },
			},
			foo: 1,
		};

		var input2 = {
			o: {
				some: { nested: "toot" },
			},
			bar: 2,
		};

		var result = {
			o: {
				some: { nested: "toot" },
				a: { different: "thang" },
			},
			foo: 1,
			bar: 2,
		};

		it("should merge two objects recursively, preferring the second object", function() {
			expect(utils.merge(input1, input2)).to.matchPattern(result);
			expect(utils.merge(null, input2)).to.matchPattern(input2);
		});

		it("should return the first object", function() {
			expect(utils.merge(input1, input2)).to.equal(input1);
		});
	});

	it("should rehydrate a compressed object structure correctly", function() {
		var input = {
			foo: {
				bar: "",
			},
			moo: "",
			some: {
				deeply: {
					nested: {
						structure1: "",
						structure2: "",
					}
				}
			}
		};

		var output = {
			foo: {
				bar: "foo.bar",
			},
			moo: "moo",
			some: {
				deeply: {
					nested: {
						structure1: "some.deeply.nested.structure1",
						structure2: "some.deeply.nested.structure2",
					}
				}
			}
		};

		expect(utils.expandObject(input)).to.matchPattern(output);
		expect(utils.expandObject(input, [])).to.matchPattern(output);
	});

	it("should rehydrate a compressed object structure case-sensitively", function() {
		var input = {
			foo: {
				BAR: "",
				MOO: {
					derp: "",
				},
			},
		};

		var output = {
			foo: {
				bar: "foo.BAR",
				BAR: "foo.BAR",
				MOO: {
					derp: "foo.MOO.derp",
				},
				moo: {
					derp: "foo.MOO.derp",
				},
			},
		};

		expect(utils.expandObject(input)).to.matchPattern(output);
	});

	it("should convert a grant object into a properly named object with mapGrants()", function() {
		var grants = {
			"bob": {
				"name": "Bob",
			},
			"pete": {
				"name": "Pete",
			},
			"joe": {
				"name": "Joe",
			},
			"bill": null,
		};

		var mappedGrants = {
			"bob": {
				"name": "Bob",
				grant: "bob",
			},
			"pete": {
				"name": "Pete",
				grant: "pete",
			},
			"joe": {
				"name": "Joe",
				grant: "joe",
			},
			"bill": {
				grant: "bill",
			},
		};

		expect(utils.mapGrants(grants)).to.matchPattern(mappedGrants);
	});

	it("should expand a permissions object with grant permissions automatically with generateGrantPermissions()", function() {
		var perms = {
			herp: {
				derp: "",
			},
			foo: "",
		};

		var grants = {
			"bob": {
				"name": "Bob",
			},
			"pete": {
				"name": "Pete",
			},
			"joe": {
				"name": "Joe",
			},
		};

		var finalPerms = {
			herp: {
				derp: "",
			},
			foo: "",
			grants: {
				main: {
					bob: "",
					pete: "",
					joe: "",
				},
				all: {
					bob: "",
					pete: "",
					joe: "",
				},
			}
		};

		expect(utils.generateGrantPermissions(perms, grants)).to.equal(perms);
		expect(utils.generateGrantPermissions(perms, grants)).to.matchPattern(finalPerms);
	});
});