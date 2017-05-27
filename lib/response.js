var EventEmitter = require("events");
var utils = require("./utilities");

module.exports = exports = function(input) {
	exports.prototype.response = function(r) {
		this.result = r;
		return this;
	};

	exports.prototype.streamResponse = function(s) {
		this.stream = s;
		return this;
	};

	exports.prototype.rawResponse = function() {
		this.raw = true;
		return this;
	};

	exports.prototype.addCookies = function(c) {
		if(!this.cookies)
			this.cookies = {};

		this.cookies = utils.merge(this.cookies, c);
		return this;
	};

	exports.prototype.removeCookies = function() {
		if(!this.cookies)
			return this;

		var delCookies = utils.flatten([Array.prototype.slice.call(arguments)]);
		for(var x in delCookies)
			this.cookies[delCookies[x]] = null;

		return this;
	};

	exports.prototype.addHeaders = function(h) {
		this.headers = h;
		return this;
	};

	exports.prototype.setSession = function(s) {
		this.session = s;
		return this;
	};

	exports.prototype.status = exports.prototype.hc = function(s) {
		this.code = s;
		return this;
	};

	exports.prototype.expectResult = function() {
		this.checkResult = true;
		return this;
	};

	exports.prototype.csrf = function() {
		this.appendCSRF = true;
		return this;
	};

	exports.prototype.end = function() {
		this.endResponse = true;
		return this;
	};

	if(input instanceof EventEmitter)
		return this.streamResponse(input);
	else if(input)
		return this.response(input);
};