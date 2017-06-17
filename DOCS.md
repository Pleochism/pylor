<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Pylor](#pylor)
  - [Initialising Pylor](#initialising-pylor)
  - [Pylor interface](#pylor-interface)
    - [`init(options)`](#initoptions)
    - [`getRolePermissions()`](#getrolepermissions)
    - [`activate(spec, options)`](#activatespec-options)
  - [Setting up endpoints](#setting-up-endpoints)
    - [Verbs](#verbs)
      - [`get` - Bulk Fetch](#get---bulk-fetch)
      - [`get+` - Bulk & Individual Fetch](#get---bulk--individual-fetch)
      - [`post` - Add](#post---add)
      - [`put` - Update](#put---update)
      - [`put-` - Unparameterised update](#put----unparameterised-update)
      - [`del` or `delete` - Deletion](#del-or-delete---deletion)
    - [Middleware](#middleware)
      - [`sslOn`](#sslon)
      - [`sslOff`](#ssloff)
      - [`noBasic`](#nobasic)
      - [`any(permissions[, override])`](#anypermissions-override)
      - [`only(permissions[, override])`](#onlypermissions-override)
      - [`all`](#all)
    - [Endpoint handlers](#endpoint-handlers)
  - [API dogfooding](#api-dogfooding)
  - [Access Control](#access-control)
    - [Permissions](#permissions)
      - [`pylor.registerAccessExtension(permission, lookup)`](#pylorregisteraccessextensionpermission-lookup)
    - [Implicit endpoint permissions](#implicit-endpoint-permissions)
    - [Roles](#roles)
      - [`pylor.hasAccess(permissionString, userData[, noExtensions])`](#pylorhasaccesspermissionstring-userdata-noextensions)
    - [Grants](#grants)
      - [`pylor.matchGrantValues(grantName, userData, values)`](#pylormatchgrantvaluesgrantname-userdata-values)
      - [`pylor.hasGrantAccess(grantName, userData)`](#pylorhasgrantaccessgrantname-userdata)
      - [`pylor.getGrantValues(grantName, userData[, noExtensions])`](#pylorgetgrantvaluesgrantname-userdata-noextensions)
      - [`pylor.registerGrantExtension(grantName, lookup)`](#pylorregistergrantextensiongrantname-lookup)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Pylor

Pylor is primarily a server-side API helper that uses [ExpressJS](www.expressjs.com) to add a simpler endpoint definition system, endpoint dogfooding and roles & permissions.

Pylor can also be used on the client-side to perform permission checks.

## Initialising Pylor

Pylor must be initialised before it can be used. It only needs to be initialised once, so you'll typically do this during app startup.

```javascript
var pylor = require("pylor");
pylor.init(options);
```

The available options are listed below. API options are only needed for server-side use:

**API options**

* `server` - the Express instance to use for defining API routes.
* `passport` - the PassportJS instance to use for HTTP Basic authentication, if needed.
* `ssl` - should SSL be enabled or disabled by default? This can be overidden on an individual basis by endpoint definitions.
* `apiRoot` - the string that API routes are mounted under. Defaults to "api".
* `version` - the version that API routes are attached to, under the `apiRoot`. Defaults to "1.0".
* `endpoint` - the string that non-API routes are mounted under. Defaults to "internal".

**Permission options**

* `roles` - a JSON object of all roles.
* `permissions` - a JSOn object of all custom permissions.
* `grants` - a JSON object map of all grants.
* `rolePermissions` - (client-side only) the client Pylor requires a list of all API routes to be able to map permissions to routes, but it has no innate knowledge of these routes, unlike the server. This parameter represents a collapsed representation of those routes, extracted from the server Pylor object with the `getRolePermissions()` call (once all API definitions have been processed); a client-side Pylor object will then rehydrate these routes and substitute them for the actual API definitions.

**Other options**

* `log` - the logging object to use for logging HTTP errors that bubble up. Must expose a method called `error()`. Defaults to the console object if not specified.

## Pylor interface

The following methods are exported by Pylor.

### `init(options)`

Described above.

### `getRolePermissions()`

Returns a map of the API routes, suitable for dehydration and sending to a client-side instance.

### `activate(spec, options)`

Set up some new API routes. See the next section for details.


## Setting up endpoints

Once Pylor is initialised, you can use it to add API endpoints by calling the `activate(spec[, options])` method.

`options` is an optional object that can only have one option: `api`. If this is set to "false", the specified routes will be mounted under the path provided as `endpoint` in the initialisation call (defaults to `internal`), instead of under the `apiRoot` value (defaults to `api`).

A `spec` is an object that expresses the API structure to create, as a nested hierarchy. Consider the following example, which sets up a theoretical API for manipulating virtual machines:

```javascript
var spec = {
  vm: {
    _middleware: [pylor.sslOn],

    get: exports.getVMs,
    "get+": exports.getSingleVM,
    post: exports.addVM,
    put: [pylor.noBasic, exports.updateVM],
    del: exports.deleteVM,

    ":vm": {
      _middleware: [pylor.sslOff],

      get: exports.getSpecialVM,
      paused: [support.doSomething, exports.getPausedVM],
      boot: {
        get: exports.getBootedVMs,
        "put-": exports.bootVM
      },
    }
  }
}
```

There's a lot going on here, so let's cover some basics first.

Each level of a spec corresponds to an element of the final endpoint, prefixed by the `apiRoot` and `version` properties. Leaf nodes must be an endpoint handler (see [Endpoint handlers](#endpoint-handlers)). Non-leaf nodes that need to represent a parameter, should be prefixed with a colon (eg. `:vm`). The tree can be nested infinitely deep. Multiple trees can exist in a single spec if required.

### Verbs

Pylor supports five verbs: GET, POST, PUT, PATCH and DELETE. These verbs are expressed in specs in their lowercase form. DELETE can also be abbreviated to "del".

There are also two special verb forms: "get+" and "put-". To understand these, let us consider how Pylor maps verbs to CRUD operations.

#### `get` - Bulk Fetch

"get" is a bulk fetch. In the VM example, line 5 would map to a call of the form `GET /api/1.0/vm`. The assumption with a bulk call is that you will be returning multiple items. You can either make the call without any arguments, which is presumed to return all items, or you can append
one or more querystring parameters named "id", eg. `GET /api/1.0/vm?id=1&id=2`. The endpoint is expected to then only return the specified items.

Bulk fetch endpoints *always* return an array of items, even if only a single ID is passed to the fetch, or if there is only a single element in the response.

#### `get+` - Bulk & Individual Fetch

"get+" is a contrived verb that indicates a hybrid individual/bulk fetch endpoint. The plus just differentiates it from regular GET. For this verb, two endpoints are generated; in the earlier example, line 6 would map to both `GET /api/1.0/vm` and `GET /api/1.0/vm/:uid`.

Note that both of these generated endpoints would map to the **same** handler; thus, some additional processing (eg. checking `opts.multiID`) may be needed if you need to determine which specific endpoint was invoked.

#### `post` - Add

"post" is an add operation. It takes no parameters. For example, line 7 of the main example would map to `POST /api/1.0/vm`.

#### `put` - Update

"put" is an update operation. It is automatically decorated with a single parameter, typically corresponding to the unique ID of the item to be updated (although it can of course be anything). For example, line 8 of the main example would map to `PUT /api/1.0/vm/:uid`.

#### `put-` - Unparameterised update

"put-" is another contrived verb; an update that is *not* automatically decorated with a parameter. It is thus functionally identical to a POST. It only exists to cater for some legacy calls which used PUT to do operations that should have been accomplished with POST. In the main example, line 18 would map to `PUT /api/1.0/vm/:vm/boot`.

#### `del` or `delete` - Deletion

"del" is a deletion. It is automatically decorated with a single parameter, typically corresponding to the unique ID of the item to be deleted. In the main example, line 9 would map to `DELETE /api/1.0/vm/:uid`.

### Middleware

Apart from the above verbs, you can also specify a key called `_middleware`. The value of this key must be an array of Express middleware functions, which will be applied to all subsequent sibling nodes, *including their children*. In the main example, line 3 defines some middleware that will apply to the entire spec. Line 12 disables that middleware for a sub-object by applying another that will undo it's effect.

"_middleware" can be defined anywhere in a given level, but typically is defined at the start.

Leaf nodes can also be an array. If so, the final element of the array is expected to be an endpoint handler, and all other elements are expected to be Express middleware functions.

Pylor defines some middlewares that can be used out of the box (all these are accessible on a Pylor instance). Some of these are higher order functions that return the middleware, instead of being the middleware innately.

#### `sslOn`

Require SSL for targeted endpoints.

#### `sslOff`

Don't require SSL for targeted endpoints.

#### `noBasic`

Disable HTTP Basic auth for an endpoint. NOTE: there is no way to reverse the effect of this middleware.

#### `any(permissions[, override])`

A middleware that will require any of the specified permissions in order to access the targeted endpoints. If `override` is true, any existing permissions will be discarded first. Multiple `any` calls will merge their permissions. If an `only` call has already set up some exclusive
permissions in the middleware chain for this endpoint, the `any` call will do nothing.

#### `only(permissions[, override])`

A middleware that will require all of the specified permissions in order to access the targeted endpoints. If `override` is true, any existing permissions will be discarded first. Multiple `only` calls will merge their permissions. If an `any` call has already set up some permissions
in the middleware chain for this endpoint, `only` will discard them and take preference.

#### `all`

A middleware that removes all other currently defined Pylor permissions for the targeted endpoints, including those implicitly defined by Pylor. This makes the endpoint accessible to anyone, without authentication.

------------------------------------------------------------------------

Middlewares can be chained as needed to enable/disable effects on child nodes. Generally, for example, SSL should be enabled at the top level and disabled on a per-endpoint basis as required.

> **note**
>
> The `any` middleware is automatically set up by Pylor for each API call. It is applied before the user-defined middlewares, allow you to override those permissions if needed, and will merge with other `any` calls as normal. See the next section for more information.

### Endpoint handlers

Endpoints are processed by endpoint handlers, which are functions with a signature of `handler([opts, [callback]])`. By convention, the handlers are defined in the same file that defines the spec for a particular piece of API, but this is not a hard requirement.

The endpoint handler is invoked with an Express request object as the context, allowing full access to the request for custom processing.

If the `callback` property is omitted, the endpoint is presumed to return a promise. Else, the callback is a typical error-first callback.

The `opts` object can have the following properties:

* `uid` - if the endpoint receives a single ID, then this property will be present, holding that value. If the endpoint receives multiple IDs, this property will be an array of those values. If the endpoint received no IDs, then this will be `undefined`.
* `uids` - this value will be an array of all the IDs the endpoint received. If the endpoint received no IDs then this will be `undefined`.
* `multiID` - a boolean indicating whether the endpoint originally received a single ID or multiple IDs.
* `headers` - the HTTP headers received, in Express response format.
* `internal` - if the function is being invoked internally, this will automatically be set to "true". See [API dogfooding](#API-dogfooding) for details.

If the handler is invoked in callback mode, and the error argument is falsy, it expects an object as the second parameter, which must either be constructed fluently from `pylor.response([response])` or `pylor.end()`, or be a plain object with the appropriate properties.

> **note**
>
> If you are using promises, you can return trivial values as-is and they will automatically be wrapped for you. For example, you could return an array as-is instead of having to return `{ result: arr }}`.

The list below names all the properties that can be set on the response object (and the equivalent function calls for fluent responses).

* `endResponse` (`end()`) - the output will be terminated with `Express.Response.end()` directly after sending headers. Useful for using Nginx's `X-Accel-Redirect` headers.
* `result | stream` (`response(res)`) - sets the response that will be sent to the client. If you use the fluent method, the system will automatically detect whether it is a stream response or a regular one. Otherwise, you have to set the correct object manually:

    * `result` - a JSON object which will be emitted verbatim to the client.
    * `stream` - a ReadableStream which will be streamed to the client.

* `headers` (`addHeaders(headers)`) - a map of headers to append to the response. Multiple calls to the fluent method with identical headers will cause the later instances to be preferred.
* `checkResult` (`expectResult()`) - tells the output handler will verify that there is a value for the `result` property, and if not will short-circuit and emit a `410` code. This flag does not test for a stream response.
* `appendCSRF` (`csrf()`) - append a CSRF token (if available via the `csurf()` module) as a value named `_csrf` on the `result` object. Has no effect if a stream response is used.
* `cookies` - a map of cookies to append to the response. If the value of a specified cookie is `null`, that cookie will be destroyed instead. If you are using the fluent methods, you should instead use these methods:

    * `addCookies(cookies)` - a map of cookies to append to the response.
    * `removeCookies(cookie1[, cookie2[, ...]])` - list of cookies to remove from the client.

* `raw` (`rawResponse()`) - the `result` object will be emitted using `.send()` instead of `.json()`. Has no effect if a streaming response is set.
* `code` (`status() | code()`) - sets the HTTP code to emit. Defaults to 200 for successful resposes, and 500 for error responses, if not explicitly provided.

For example, the following two responses are identical:

```javascript
return {
    headers: {
        "X-Foo": 1,
    },
    result: [],
    code: 403,
    checkResponse: true,
    raw: true,
}
```

```javascript
return pylor.response([])
    .addHeaders({ "X-Foo": 1 })
    .status(403)
    .expectResponse()
    .rawResponse();
```

## API dogfooding

Pylor allows you to consume API endpoints as internal methods on the server side. Endpoint handlers are exposed in the following manner:

* A Pylor instance exposes a property at `pylor.api.latest`. This  corresponds to the latest version of the API; you can also access the API calls via their specific versions, eg. `pylor.api["1.0"]`. Non-API calls are exposed at `pylor.internal`.
* Calls follow the same rules as for permission generation, except that the "api" prefix is omitted for API endpoints. Parameters are replaced with themselves *sans* colons, and the verb is appended to the end.

    * `GET /api/1.0/foo/:bar/:uid => pylor.api.latest.foo.bar.get`

The function called is identical to the one called for a proper HTTP call, but there is obviously no real request to serve as the caller context. Therefore the `opts` object provided to the handler is used as the context. Handlers should be aware of this if expecting to be used
internally, and make judicious use of the `opts.internal` flag to ensure they only access some values such as user session data when it is actually present.

Dogfooded endpoints support promises; if you do not pass a callback function to the invocation, the function will return a promise. Note that this is true whether or not the target endpoint handler has been set up to return promises. Equally, if you pass a callback, it will
always be invoked in the error-first manner, even if the target endpoint handler returns a promise.

Dogfooded calls automatically unwrap responses, thus they return `x` if the function uses either `return { result: x }` or `return x` (or the callback-based equivalents).

## Access Control

Pylor achieves its access control using three concepts: permissions, roles, and grants.

### Permissions

A permission is an string which acts as a token representing some arbitrary level of access to some arbitrary operation. The only requirement is that the string be unique amongst all defined permissions. Permissions have no intrinsic meaning beyond that assigned by the system using them (apart from those auto-generated for Pylor endpoints, which do intrinsically control access to those endpoints).

By convention, permission strings are hierarchical, separated by periods.

* `some.thing`
* `group.item.specificity`
* `whatever.you.want.as.many.levels.as.desired`

Permissions are exposed on a Pylor instance via the `pylor.p` property.

There are two special values that can be used in permission strings:

* `patterns`: these are values that let you omit a single permission value and allow any value to occur in that specific position. They are represented with underscores. This is useful in situations where you might expect a variety of values (such as multiple verbs). Patterns do not cascade, they only match a single value at the specified level. Examples:

    * `foo.bar._` => matches any of `[foo.bar.moo, foo.bar.blah]` but not `foo.bar.moo.woo`
    * `_.two.three` => matches `foo.two.three` but not `zero.one.two.three`

* `wildcards`: these are values that allow you to omit an entire sub-tree of a permission. Wildcards cascade, and thus match any number of additional values, to an arbitrary depth. They are represented with asterisks. They are useful when you want to give someone access to an entire permission type without having to constantly revise it due to future permission changes further down the tree. This feature should be used carefully, because since it grants full access to all permissions below it, you may inadvertently grant access to a permission that was not intended. Examples:

    * `foo.bar.*` => matches any of `[foo.bar.one, foo.bar.two, foo.bar.a.b.c.d.e.f]`
    * `one.*.two` => the asterisk renders the "two" portion irrelevant, thus this behaves as a permission of the form `one.*`

 A sample "custom" (aka. non-endpoint) permission object structure looks like this:

```javascript
{
    "impersonate": "",
    "users": {
        "enrolment": {
            "all": ""
        },
        "books": {
            "all": ""
        }
    },
    "calendar": {
        "all": ""
    }
}
```

At runtime, Pylor will expand the permissions by simply appending each level of the tree, separated by periods. This results in a final object of this form:

```javascript
{
    "impersonate": "impersonate",
    "users": {
        "enrolment": {
            "all": "users.enrolment.all"
        },
        "books": {
            "all": "users.books.all"
        }
    },
    "calendar": {
        "all": "calendar.all"
    }
}
```

These expanded values are the permission strings you'll then use everywhere else. If you try to use a permission string that is not defined in the permission object, permission checks for that value will throw an error.

------------------------------------------------------------------------


The following methods are exposed for working with permissions:

#### `pylor.registerAccessExtension(permission, lookup)`

This method registers a new access extension. Access extensions allow you to dynamically modify permission checks. When the specified `permission` is processed during any access check, the `lookup` function will be invoked synchronously and given the `user` object from the initial call. The function must then return a boolean which will be OR'd with the main response, thus allowing you to perform custom logic to determine if a user should have access.



### Implicit endpoint permissions

Pylor operates on the principle of "deny by default". All endpoints are given automatic permissions based on their paths; the presence of these permissions means that a brand-new endpoint cannot be accessed until you've assigned the relevant permissions to a user's role.

The following rules are used to construct the permission strings for an endpoint, and are executed on the full path as generated by Pylor. For more detail on how permissions work, see [Permissions](#permissions).

* The endpoint path is split by `/`. Path elements will be joined by a period when constructing the permission string. If the endpoint is an API path, the second element (corresponding to the API version) is discarded. `api` is the root of API permissions. If the endpoint is a non-API path, the leading `internal` is maintained, making this the root of non-API permissions.

    * `/api/1.0/foo/bar => api.foo.bar`
    * `/internal/foo/bar => internal.foo.bar`

* Permissions are suffixed with the appropriate verb.

    * `GET /api/1.0/foo/bar => api.foo.bar.get`
    * `PUT /internal/one/two => internal.one.two.put`

* If the path contains any parameters (including UIDs added automatically by Pylor for GET, PUT and DELETE endpoints), a permission is generated which removes the leading colons from the wildcards.

    * `POST /api/1.0/foo/:bar => api.foo.bar.post`
    * `PUT /api/1.0/foo/:uid => api.foo.uid.put`

* If the path contains any parameters, a second permission is also generated which drops any tailing `:uid` permissions, and replaces remaining permissions with underscores. These are called "pattern matches". The advantage of this form is that it is immune to parameter name changes.

    * `GET /api/1.0/foo/:bar => api.foo._.get`
    * `POST /api/1.0/foo/:uid => api.foo.post`
    * `GET /internal/herp/:derp/:uid => internal.herp._.get`

* All permissions for an endpoint are combined and used in a Pylor `any` check. Thus you may use any of the generated permissions to provide access to the endpoint.

    * `GET /api/1.0/foo/:bar => any(["api.foo.bar.get", "api.foo._.get"])`
    * `PUT /api/1.0/moo/:uid => any(["api.moo.get", "api.moo.uid.get"])`



### Roles

Permissions are combined together into roles. A role encapsulate a logical unit of access rights. A single user can then have multiple roles, so roles can be designed to be quite specific, and combined to achieve the desired effect. A sample roles structure looks as such:

```javascript
{
    "*": {
        "name": "Default Role",
        "permissions": [
            "api.foo.bar",

            "internal.bar",

            "!custom.whatever"
        ]
    },

    "role1": {
        "name": "First Role",
        "permissions": [
            "api.something",
            "api.something.else"
        ]
    },

    "role2": {
        "name": "Second Role",
        "permissions": [
            "moo._",
            "custom.*"
        ]
    }
}
```

Each role has a "name" property, which is the human name for the role. The "permissions" property is an array of the permission strings for that role. Permissions are by convention are organised into three groups, with whitespace between them: API endpoint permissions, then
non-API endpoint permissions, then custom permissions. Strings should be ordered alphabetically within each grouping, but this has no effect on the functionality.

The asterisk role is a global role that is applied to all users; those permissions will always be added to users when doing a permission check. (This should not be confused with permission wildcards).

There are three special values that can be used in permissions within roles: patterns, wildcards, and negation. Patterns and wildcards are identical to the way they are used in [standalone permissions](#permissions). Negation is however specific to permission strings inside roles:

* `negation`: permissions can be negated within roles. This allows you to revoke access for a permission that might be granted by another role, ensuring that the user does NOT have a certain permission. Negated permissions have a priority hierarchy, which works as such:

    * Standard negated permission (eg. `!foo.bar`) have higher priority than regular permissions, but lower priority than wildcard permission. So in that example, a permission of `foo.bar` would be negated, but a permission of `foo.*` would override it, and the role would thus match on `foo.bar`.
    * Negated wildcard permissions (eg. `!foo.*`) have higher priority than all other permissions that are matched by that permission; for example, this would negate both `foo.moo` and `foo.bar`.

------------------------------------------------------------------------

The following methods are exposed for working with roles:

#### `pylor.hasAccess(permissionString, userData[, noExtensions])`

This method determines whether or not a user has access to one or more permissions.

`permissionString` is one of the following:

* A single permission string (will be used in an `any` check)
* An array of permission strings (will be used in an `any` check)
* An object containing either an `only` or an `any` property, which are arrays of permission strings if present. Will be used in an `any` or `only` check as appropriate. If the object contains both properties, the `only` property takes precedence.

`userData` is a user object containing, at minimum, a `roles` property containing an array of the user's roles (can be an empty array).

If `noExtensions` is provided, extension methods will not be used when checking access.

### Grants

Grants are more freeform than permissions; grants capture access to arbitrary dynamic values. There are numerous cases where a user needs access to something based not only on having a specific permission (eg. "dependents"), but also a particular value or set of values inextricably
linked to that permission (eg. "Billy", "Jane"). The roles system can handle the permission check, but not the dynamic values; the grants system takes care of that.

An example grant object structure looks like this:

```javascript
{
    "hods": {
        "name": "Departments",
        "grant": ""
    },
    "publishers": {
        "name": "Publishers",
        "grant": ""
    }
}
```

Each grant has a "name" property, which is the human name for the grant, and a "grant" property, which is populated by Pylor at runtime with the internal identifying value for that grant. Note that there is no indication of what the dynamic list of values for a specific grant are; this is decided externally, by the consuming application.

Grants are also exposed on a Pylor instance via the `pylor.g` property.

Also at runtime, Pylor generates some permissions corresponding to grants. It will do this automatically based on the grants provided to the instance constructor. Each grant gets two permissions associated with it (and these are merged into the existing permission set, thus
making them available on `pylor.p` like all other permissions):

* `grants.main.grant_name`
* `grants.all.grant_name`

The permissions under `grants.all` are intended to give full access to that grant. So if this was a grant that gave access to specific publishers, a role with `grants.all.publishers` would mean the user had access to all publishers.

The permissions under `grants.main` by contrast, indicate whether a user has regular access to a grant. It does not indicate whether the user has any values for that grant, and if they do not have any, then this will behave as if they did not have the permission at all.

When a user logs in, the grants should be iterated and all `grants.all` permissions converted to `null`. This is then checked for in the appropriate methods, such as `matchGrantValues`, and can also be checked for in database functions to detect "full access" permissions.

------------------------------------------------------------------------

The following methods are available for doing grant checks:

#### `pylor.matchGrantValues(grantName, userData, values)`

This method checks if a user's grants allow access to one or more values for a specified grant. This method knows how to check for `grants.all` permissions.

`grantName` is the name of the grant to check, or a grant object of the typical form.

`userData` is a user object containing a `roles` property (an array of the user's roles), and a `grants` property if applicable.

`values` is a single value, or an array, of values to check against the user's grants. If it is an array, the user only needs to be able to match one of the values for the call to succeed.

#### `pylor.hasGrantAccess(grantName, userData)`

This method checks if a user is allocated the specified grant. This does not say anything about whether or not the user has values for the grant. This can be used as a conditional check before executing expensive grant-related filtering code.

`grantName` is the name of the grant to check, or a grant object of the typical form.

`userData` is a user object containing a `roles` property (an array of the user's roles).

#### `pylor.getGrantValues(grantName, userData[, noExtensions])`

This method returns an array of the values that the user is assigned to for a specific grant. If the user is not permitted to access the grant, it will be an empty array. If the user has full access via a `grants.all` permission, the return value will be `null`.

`grantName` is the name of the grant to check.

`userData` is a user object containing a `roles` property (an array of the user's roles), and a `grants` property if applicable.

If `noExtensions` is set, extension methods will not be used when calculating grant values.

#### `pylor.registerGrantExtension(grantName, lookup)`

This method registers a new grant extension.

Access extensions allow you to dynamically modify grant checks. When the specified `grantName` is processed during any grant value check/fetch, the `lookup` function will be invoked synchronously and given the `userData` object from the initial call. The function must then return a
value which will be concatenated with the main response, thus allowing you to append custom values to the main response. If the return value of a lookup is `null`, full access is assumed and this function then also returns `null`.