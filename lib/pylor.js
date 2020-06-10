var utils = require("./utilities");

var defaultRole = "*";
var wildcard = "*";
var patternMatch = "_";
var grantExtensions = {};
var accessExtensions = {};

exports.log;

exports = module.exports = {
	DEFAULT_ROLE: defaultRole,
	permissions: {},
	roles: {},
	grants: {},
};

exports.resolveRole = function(role) {
	// Resolve the roles into a permissions set. Compact to remove duplicates.
	var set = utils.compact(role.permissions);

	// Expand the permission strings into an object for easier parsing
	var ret = {plus: {}, minus: {}, superminus: {}, superplus: {}};

	var handlePiece = function(base, pieces) {
		var piece = pieces.shift();

		if(!(piece in base)) {
			// If we don't have deeper permissions, we terminate the chain with null for easy comparison
			if(!pieces.length)
				base[piece] = null;
			else
				base[piece] = handlePiece({}, pieces);
			return base;
		}
		else {
			// If the existing key is a wildcard, ignore the rest of this chain
			if(wildcard in base[piece])
				return base;
			else
				return handlePiece(base[piece], pieces);
		}
	};

	set.forEach(function(item) {
		if(item[0] === "!" && item[1] === "!")
			handlePiece(ret.superminus, utils.compact(item.slice(2).split(".")));
		else if(item[0] === "!")
			handlePiece(ret.minus, utils.compact(item.slice(1).split(".")));
		else if(item[0] === "+")
			handlePiece(ret.superplus, utils.compact(item.slice(1).split(".")));
		else
			handlePiece(ret.plus, utils.compact(item.split(".")));
	});

	return ret;
};

exports.init = function(opts) {
	exports.log = opts.log || console;
	exports.roles = opts.roles;
	exports.permissions = {};
	exports.grants = opts.grants;

	// Precalculate permissions for roles
	for(var key in exports.roles) {
		exports.permissions[key] = exports.resolveRole(exports.roles[key]);
	}
};

exports.reset = function() {
	exports.permissions = {};
	exports.roles = {};
	exports.grants = {};
	accessExtensions = {};
	grantExtensions = {};
};

exports.hasAccess = function(checks, user, noExtensions) {
	if(!checks)
		throw new Error("No permission provided for check");
	if(!user)
		throw new Error("No user provided for roles check");
	if(!user.roles)
		throw new Error("Supplied user has no roles");

	var roles = user.roles.concat(defaultRole);

	var readObj = function(base, pieces, plus) {
		// If this is an empty object, there cannot be any permissions
		if(base === null || !Object.keys(base).length)
			return false;

		var x;
		while((x = pieces.shift())) {
			if(base === null)
				return false;

			// If the provided permission itself is trying to match a wildcard, pass as long as there's at least one sub-entry
			// Pass with 1 to check later
			if(x === wildcard && plus)
				return Object.keys(base).length > 0 ? 1 : 0;

			// If we're parsing negated conditions, we give it a higher priority if there's a matching wildcard
			if(x === wildcard && !plus)
				return wildcard in base ? 1 : 0;

			// If this element has an "all" sub-match, we know we have permission
			if(wildcard in base)
				return 1;

			if(x === patternMatch) {
				// Impossible to iterate deeper? Then we've passed the match.
				if(!pieces.length)
					return true;

				// If there's more than one key, we don't know which one to match on with the pattern. So we parallelise.
				return utils.some(Object.keys(base), function(key) {
					return readObj(base[key], Array.prototype.slice.call(pieces, 0), plus);
				});
			}
			else {
				// No element, no permission
				if(!(x in base) && !(patternMatch in base))
					return false;

				if(pieces.length) {
					// Iterate deeper
					if(x in base)
						base = base[x];
					else if(patternMatch in base)
						base = base[patternMatch];

					continue;
				}

				// No deeper permissions, and we know the permission exists on this level...pass
				if(base[x] === null)
					return true;

				return false;
			}
		}
	};

	var validateCheck = function(check) {
		var no = false, yes = false, veryno = false, veryyes = false, i;

		for(i = 0; i < roles.length; i++) {
			if(roles[i] in exports.permissions) {
				veryno = veryno || readObj(exports.permissions[roles[i]].superminus, check.split("."), false);
				no = no || readObj(exports.permissions[roles[i]].minus, check.split("."), false);
				yes = yes || readObj(exports.permissions[roles[i]].plus, check.split("."), true);
				veryyes = veryyes || readObj(exports.permissions[roles[i]].superplus, check.split("."), false);
			}
		}

		// If veryyes === true, only strong negation can defeat it.
		// If no === 1, it means we are negated with a wildcard, the highest priority.
		// If veryno === true, it means we are negated with a strong negative, the second highest priority
		// If veryno === 1, it means we are negated with a strong negative wildcard
		// if yes === 1, it means we have permission with a wildcard, which has third highest priority
		// Negation has the next highest priority

		if (veryyes === true && veryno !== true)
			return true;
		if (veryyes === 1 && !veryno)
			return true;
		// Priority 1
		if(no === 1)
			return false;
		// Priority 2
		if(veryno === true)
			return false;
		// Priority 3
		if(veryno === 1)
			return false;
		// Priority 4
		if(yes === 1)
			return true;

		return !no && !veryno && (yes || (veryyes && !veryno));
	};

	var parseCheck = function(check) {
		var ret = validateCheck(check);

		if(!noExtensions && check in accessExtensions)
			for(var i = 0; i < accessExtensions[check].length; i++)
				ret |= accessExtensions[check][i](user);

		return ret;
	};

	if(typeof checks == "string")
		return utils.some([checks], parseCheck);
	else if(Array.isArray(checks))
		return utils.some(checks, parseCheck);
	else if(checks.only && checks.only.length)
		return utils.every(checks.only, parseCheck);
	else if(checks.any && checks.any.length)
		return utils.some(checks.any, parseCheck);
	else
		return false;
};

exports.registerAccessExtension = function(access, lookup) {
	if(!(access in accessExtensions))
		accessExtensions[access] = [];
	accessExtensions[access].push(lookup);
};


//___________________________________________________________________


// Does the user have access to a specific type of grant in any way?
// This does not make presumptions about the form of the access.
exports.hasGrantAccess = function(grant, user) {
	if(!grant)
		throw new Error("No grant provided for hasGrantAccess check");
	if(!user)
		throw new Error("No user provided for hasGrantAccess check");
	if(!("roles" in user))
		throw new Error("User provided for hasGrantAccess check has no roles");

	if(typeof grant === "string")
		return exports.hasAccess("grants.all." + grant, user) || exports.hasAccess("grants.main." + grant, user);

	if("grant" in grant)
		return exports.hasAccess("grants.all." + grant.grant, user) || exports.hasAccess("grants.main." + grant.grant, user);

	throw new Error("Grant object supplied for hasGrantAccess has no 'grant' property");
};

// Check if there is a match on any of the values provided
exports.matchGrantValues = function(grant, user, match, extra) {
	if(!grant)
		throw new Error("No grant provided for matchGrantValues check");
	if(!user)
		throw new Error("No user provided for matchGrantValues check");
	if(!("roles" in user))
		throw new Error("User provided for matchGrantValues check has no roles");

	user.grants = user.grants || {};

	if(typeof grant === "string" && exports.hasAccess("grants.all." + grant, user))
		return true;

	if(typeof grant !== "string" && "grant" in grant && exports.hasAccess("grants.all." + grant.grant, user))
		return true;

	// If the user does not have full access, and is checking for full access, they obviously fail
	if(match === null)
		return false;

	if(typeof grant === "string" && !exports.hasAccess("grants.main." + grant, user))
		return false;

	if(typeof grant !== "string" && "grant" in grant && !exports.hasAccess("grants.main." + grant.grant, user))
		return false;

	var vals = exports.getGrantValues(grant, user, false, extra);
	if(vals === null)
		return true;

	if(!Array.isArray(match))
		return vals.indexOf(match) > -1;

	return utils.some(vals, function(x) { return match.indexOf(x) > -1; });
};

// Get a list of the grant values a user has for a specific grant
exports.getGrantValues = function(grant, user, noExtensions, extra) {
	if(!grant)
		throw new Error("No grant provided for getGrantValues check");
	if(!user)
		throw new Error("No user provided for getGrantValues check");
	if(!("roles" in user))
		throw new Error("User provided for getGrantValues check has no roles");

	var g = grant;
	if(typeof g === "object") {
		if(!("grant" in g))
			throw new Error("Grant object supplied for getGrantValues has no grant property");
		g = g.grant;
	}
	if(!g)
		throw new Error("No valid grant provided for getGrantValues");

	if(!(g in exports.grants))
		throw new Error("Grant '" + g + "' does not exist");

	if(exports.hasAccess("grants.all." + g, user))
		return null;

	if(!("grants" in user))
		return [];

	var ret = [];
	// If the user innately has this grant, then use the values they have.
	// Without the "innate" portion of the check, we might use values they
	// still have from a previous assignment but for which they no longer
	// have access.
	if(exports.hasAccess("grants.main." + g, user, true))
		ret = user.grants[g] || [];

	if(!noExtensions && g in grantExtensions) {
		for(var i = 0; i < grantExtensions[g].length; i++) {
			const v = grantExtensions[g][i](user, extra);
			if(v === null)
				return null;
			ret = ret.concat(v);
		}
	}

	return ret;
};

// Register a function to extend the values of a given grant lookup
exports.registerGrantExtension = function(grant, lookup) {
	var g = grant;
	if(typeof g === "object") {
		if("grant" in g)
			g = g.grant;
		else
			g = "";
	}

	if(!g)
		throw new Error("Did not supply a valid grant for grant extension");

	if(!(g in grantExtensions))
		grantExtensions[g] = [];
	grantExtensions[g].push(lookup);
};


//_______________________________________________________

exports.checkPermission = function(req, res, next) {
	if(!req.pylor)
		req.pylor = {};
	var any = req.pylor.any || [];
	var only = req.pylor.only || [];

	if(req.pylor.ssl && !req.ssl) {
		if(!req.pylor.noLog)
			exports.log.warn("Denying access to SSL-only resource", {path: req.path});
		return res.status(403).json({info: "That path requires SSL", path: req.path});
	}

	// If there's no permission checks set, carry on
	if((!any.length && !only.length))
		return next();

	// If user is logged in
	if(req.session && req.session.user && req.session.user.roles) {
		var user = req.session.user;
		if(exports.hasAccess({ any: any, only: only }, user))
			return next();

		if(!req.pylor.noLog)
			exports.log.warn("Denying access to person that does not have the right permissions", {person: user._id, userRoles: user.roles, allowed: {any: any, only: only}, route: req.route.path, method: req.method});
		return res.status(403).json({info: "Access denied", detail: "User does not have the right permissions"});
	}

	// Check default role
	if(exports.hasAccess({any: any, only: only}, {roles: []}))
		return next();

	// Catch-all...person must not be logged in
	if(!req.pylor.noLog)
		exports.log.warn("Denying access to person that isn't logged in", {route: req.route.path, method: req.method});
	if(res.statusCode === 200)
		res.status(401);
	res.json({info: "Access denied", detail: "User is not logged in"});
};

exports.sslOn = function(req, res, next) {
	if(!req.pylor)
		req.pylor = {};
	req.pylor.ssl = true;
	next();
};

exports.sslOff = function(req, res, next) {
	if(req.pylor)
		delete req.pylor.ssl;
	next();
};

exports.any = function(perms, override) {
	var ret = {any: utils.flatten([perms])};

	return function(req, res, next) {
		if(next) {
			var ssl = req.pylor ? Boolean(req.pylor.ssl) : false;
			if(override)
				delete req.pylor;

			if(!req.pylor)
				req.pylor = {ssl: ssl};

			// Raw middleware
			if(req.pylor.only)
				return next();
			if(req.pylor.any)
				req.pylor.any = utils.union(req.pylor.any, ret.any);
			else
				req.pylor.any = ret.any;

			return next();
		}
		return ret;
	};
};

exports.only = function(perms, override) {
	var ret = {only: utils.flatten([perms])};

	return function(req, res, next) {
		if(next) {
			var ssl = req.pylor ? !!req.pylor.ssl : false;
			if(override)
				delete req.pylor;

			if(!req.pylor)
				req.pylor = {ssl: ssl};

			// Raw middleware
			delete req.pylor.any;
			if(req.pylor.only)
				req.pylor.only = utils.union(req.pylor.only, ret.only);
			else
				req.pylor.only = ret.only;
			return next();
		}
		return ret;
	};
};

exports.all = function(req, res, next) {
	if(!req.pylor)
		return next();
	if(req.pylor.any)
		delete req.pylor.any;
	if(req.pylor.only)
		delete req.pylor.only;
	next();
};

exports.noLog = function(req, res, next) {
	if(!req.pylor)
		req.pylor = {};
	req.pylor.noLog = true;
	next();
};