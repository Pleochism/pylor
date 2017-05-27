module.exports = {
	compact: function(arr) {
		var ret = [];

		arr.forEach(function(item) {
			if(item)
				ret.push(item);
		});

		return ret;
	},

	union: function(a, b, c) {
		var ret = [];
		if(a)
			a.forEach(function(elem) {
				if(ret.indexOf(elem) === -1)
					ret.push(elem);
			});

		if(b)
			b.forEach(function(elem) {
				if(ret.indexOf(elem) === -1)
					ret.push(elem);
			});

		if(c)
			c.forEach(function(elem) {
				if(ret.indexOf(elem) === -1)
					ret.push(elem);
			});

		return ret;
	},

	flatten: function(arr, level, current) {
		level = level || Infinity;
		current = current || 0;
		var result = [];
		arr.forEach(function(el) {
			if(Array.isArray(el) && current < level) {
				result = result.concat(module.exports.flatten(el, level, current + 1));
			} else {
				result.push(el);
			}
		});
		return result;
	},

	some: function(arr, handler) {
		for(var i = 0; i < arr.length; i++)
			if(handler(arr[i]))
				return true;
		return false;
	},

	every: function(arr, handler) {
		for(var i = 0; i < arr.length; i++)
			if(!handler(arr[i]))
				return false;
		return true;
	},

	extend: function(out, other) {
		for (var key in other) {
			if (other.hasOwnProperty(key))
				out[key] = other[key];
		}

		return out;
	},

	merge: function(target, source) {
		/* Merges two (or more) objects,
		giving the last one precedence */
		if (typeof target !== "object" || target === null)
			target = {};

		for (var property in source) {
			if (source.hasOwnProperty(property) ) {
				var sourceProperty = source[ property ];
				if (typeof sourceProperty === "object") {
					target[property] = module.exports.merge(target[property], sourceProperty);
					continue;
				}
				target[property] = sourceProperty;
			}
		}
		//for (var a = 2, l = arguments.length; a < l; a++) {
		//	module.exports.merge(target, arguments[a]);
		//}
		return target;
	},

	expandObject: function(obj, pth) {
		var ret = {}, path = pth || [];
		for(var key in obj) {
			if(typeof obj[key] === "object") {
				ret[key.toLowerCase()] = module.exports.expandObject(obj[key], path.concat([key]));
				if(key.toLowerCase() !== key)
					ret[key] = module.exports.expandObject(obj[key], path.concat([key]));
			}
			else if(obj[key] === "") {
				ret[key.toLowerCase()] = path.concat([key]).join(".");
				if(key.toLowerCase() !== key)
					ret[key] = path.concat([key]).join(".");
			}
		}
		return ret;
	},

	mapGrants: function(grants) {
		var ret = {};
		for(var key in grants) {
			ret[key] = grants[key] || {};
			ret[key].grant = key;
		}

		return ret;
	},

	generateGrantPermissions: function(permissions, grants) {
		permissions.grants = { main: {}, all: {} };
		for(var key in grants) {
			permissions.grants.main[key] = "";
			permissions.grants.all[key] = "";
		}
		return permissions;
	},
};