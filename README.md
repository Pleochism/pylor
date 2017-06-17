# Pylor

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Introduction](#introduction)
- [Installation](#installation)
- [Why do I want this? _DO_ I want this?](#why-do-i-want-this-_do_-i-want-this)
- [Basic Walkthrough](#basic-walkthrough)
  - [Boilerplate](#boilerplate)
  - [Endpoints](#endpoints)
- [Documentation](#documentation)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Introduction

Pylor is an API helper library for [Express.js](https://expressjs.com/). It lets you create and manage REST API routes with a simpler wrapper on top of Express, and adds a powerful permission system and support for dogfooding your endpoints.

Pylor has no dependencies, apart from the implicit dependency on Express, and works equally well in both Node.js and the browser.

Pylor was initially developed for internal use at [ITSI](https://www.it.si).

## Installation
`npm install --save pylor`

## Why do I want this? _DO_ I want this?
Pylor aims to make life easier when your backend is more or less just Express. Pylor is not a replacement for Express, nor is it trying to be a fundamental rework of how Express does things, nor an extremely clever DSL. It is just a wrapper designed to be obvious and simple.

Use Pylor if you want some or all of these:
* A REST system that works with Express instead of replacing it.
* A logical convention for organising your endpoint controllers.
* A fire-and-forget system for adding new endpoints.
* A mechanism for versioning your API easily.
* A powerful permission system, integrated directly into your endpoints, and extensible to the rest of your backend (and front-end if needed).
* A standard for consuming controllers internally, aka. dogfooding.
* It's been 3 months so it's time to rewrite your codebase with something new.

Don't use Pylor if:
* You don't want to.
* You distrust people who bothered to aim for 100% coverage. They're probably counterproductively obsessive.
* You looked up the name and now you're imagining sphincters and it's grossing you out a litte.

## Basic Walkthrough

### Boilerplate

First, you need to initialise Pylor once, with whatever options you need. Typically, this will occur directly after the Express instance is instantiated:

```javascript
  pylor.init({ server: express });
```

The `server` property is the only required property, but there are several others. The permission system will be inactive without some of them. You can read the full list in the [documentation](https://github.com/Pleochism/pylor/blob/master/DOCS.md#initialising-pylor).

Then, you need to set up some system for loading the endpoints. The convention is to define each section of the API in it's own file, which is then stored in a folder. You can then use a module like [walk](https://github.com/Daplie/node-walk) to iterate all the API pieces and load them. Here's an example of that:

```javascript
  const path = require("path");
  const walk = require("walk");

  const apiFolder = "/some/path";

  const walker = walk.walk(apiFolder, {});

  walker.on("file", (root, fileStats, next) => {
    if(path.extname(fileStats.name) !== ".js")
      return next();

    try {
      const mod = require(path.join(root, fileStats.name));
      if(typeof mod.setup === "function")
        mod.setup();
    }
    catch(e) {
      console.error("Error loading API definition from " + fileStats.name);
    }

    next();
  });

  walker.on("end", () => {
    console.log("Finished loading API");
  });
```

Alternatives include iterating a fixed list of known files, or using some form of module self-registration.

The loading is done - again, by convention - by exporting a method named `setup()` from each file. This method should perform all the logic required to configure that particular set of endpoints. Typically, this is just a call to `pylor.active()` with the object defining the structure.

Once that's done, you're set to begin defining endpoints.

### Endpoints

Here is an annotated sample endpoint file, which exports a `setup()` method as described in the previous section.

```javascript
const pylor = require("pylor");

exports.setup = () => {

  const restStructure = {

    // This entire object will be exposed at /api/1.0/items
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

  // Add these endpoints to
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

## Documentation

[Documentation](https://github.com/Pleochism/pylor/blob/master/DOCS.md)