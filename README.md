Pylor
---------

Pylor is an API helper library for [Express.js](https://expressjs.com/). It lets you create and manage REST API routes with a simpler wrapper on top of Express, and adds a powerful permission system and support for dogfooding your endpoints.

Pylor has no dependencies, apart from the implicit dependency on Express, and works equally well in both Node.js and the browser.

Pylor was initially developed for internal use at [ITSI](https://www.it.si).

Installation
-------------
`npm install --save pylor`

Example
---------

```javascript
const pylor = require("pylor");

exports.setup = () => {
  const restStructure = {
    items: {
      // Apply middleware at any level to have it apply to all sibling and child nodes
      _middleware: [pylor.sslOn],

      // Use the standard verbs to define endpoints
      get: exports.getAllItems,

      // Endpoints will automatically be decorated with parameters if the verb needs it
      put: exports.updateItem,

      // Define custom parameters wherever you like
      ":id": {

        // Add specialised middlwares for endpoints
        get: [someMiddlewareThing, exports.getSpecificItem],

      },
    },
  };

  pylor.activate(restStructure);
};

// Endpoints can use callbacks...
exports.getSpecificItem = function(options, callback) {

  // Any other endpoint defined in the entire application can be invoked.
  // Pylor converts seamlessly between promises and callbacks
  // so you can use the syntax that makes sense for the calling site.

  return pylor.api.latest.items.get({ uid: options.id })

};

// ...or promises
exports.getAllItems = function(options) {

  // Endpoints are implicitly scoped to the Express `req` object
  const user = this.session.user;

  // Perform custom permission checks whenever you need.
  if(!pylor.hasAccess(pylor.p.some.permission, user))
    throw new Error("No access");

  // The "options" object includes some metadata about the endpoint,
  // such as whether or not it was called with multiple parameters,
  // and exposed Express path parameters.

  return Promise.resolve(options.multiID ? [1, 2, 3] : 1)
};


// If you don't need the options for a promise-based endpoint, it can be omitted
exports.updateItem = async function() {

  // All endpoints are given implicit permissions that can be used for access control
  // The permission system supports roles, wildcards, default permissions, and placeholder values
  if(!pylor.hasAccess(pylor.p.api.anotherSection._.values, this.session.user))
    throw new Error("Nope");

  const item = await db.saveThing(this);

  // Configure the response as needed.
  const resultObject = { result: item, code: 202, headers: { "Content-Type": "application/json" } };

  // You can also use a simple fluent interface.
  return rester
    .response(item)
    .status(202)
    .addHeaders({
      "Content-Type": "application/json",
    });
};

```

Documentation
---------

[Documentation](https://github.com/Pleochism/pylor/blob/master/DOCS.md) (in progress)