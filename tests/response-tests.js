/* global describe, it, before, beforeEach, after, afterEach */


var sinon = require("sinon");
var chai = require("chai");
chai.use(require("chai-match-pattern"));
var fs = require("fs");

var expect = chai.expect;
var assert = chai.assert;

var Response = require("../lib/response")
var module;

describe("Response object", function() {
	beforeEach(function() {
		module = new Response();
	});

	it("should set an object response via constructor", function() {
		var module2 = new Response({ a: 1});
		expect(module2.result).to.matchPattern({ a: 1 });
		expect(module2.stream).to.be.undefined;
	});

	it("should set a stream response via constructor", function() {
		var s = fs.ReadStream(".");
		var module2 = new Response(s);
		expect(module2.result).to.be.undefined;
		expect(module2.stream).to.equal(s);
	});

	it("should set the response", function() {
		module.response({ a: 1 });
		expect(module.result).to.matchPattern({ a: 1 });
	});

	it("should set the stream response", function() {
		module.streamResponse("mmm");
		expect(module.stream).to.equal("mmm");
	});

	it("should set the raw response", function() {
		module.rawResponse();
		expect(module.raw).to.be.true;
	});

	it("should be able to add cookies", function() {
		module.addCookies({
			cookie: "value",
			a: 1,
		});

		module.addCookies({
			cookie: "value2",
		});

		expect(module.cookies).to.matchPattern({
			cookie: "value2",
			a: 1,
		});
	});

	it("should be able to remove cookies", function() {
		module.addCookies({
			cookie: "value",
			a: 1,
			b: 2,
			c: 3,
		});

		module.removeCookies("cookie", "c");

		expect(module.cookies).to.matchPattern({
			cookie: null,
			a: 1,
			b: 2,
			c: null,
		});
	});

	it("should be able to remove cookies that don't exist", function() {
		var ret = module.removeCookies("cookie", "c");

		expect(ret).to.equal(module);
	});

	it("should set the headers", function() {
		module.addHeaders({ a: 1, b: 2 });
		expect(module.headers).to.matchPattern({ a: 1, b: 2 });
	});

	it("should set the session", function() {
		module.setSession({ a: 1, b: 2 });
		expect(module.session).to.matchPattern({ a: 1, b: 2 });
	});

	it("should set the status", function() {
		module.status(200);
		expect(module.code).to.equal(200);
		module.hc(403);
		expect(module.code).to.equal(403);
	});

	it("should expect a result", function() {
		module.expectResult();
		expect(module.checkResult).to.be.true;
	});

	it("should allow a CSRF", function() {
		module.csrf();
		expect(module.appendCSRF).to.be.true;
	});

	it("should end the response", function() {
		module.end();
		expect(module.endResponse).to.be.true;
	});
});