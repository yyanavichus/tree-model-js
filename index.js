var mergeSort, findInsertIndex, uuidv4, Denque;
mergeSort = require('mergesort');
findInsertIndex = require('find-insert-index');
uuidv4 = require('uuid/v4');
Denque = require("denque");

module.exports = (function () {
  'use strict';

  var walkStrategies;

  walkStrategies = {};

  function k(result) {
    return function () {
      return result;
    };
  }

  function TreeModel(config) {
    config = config || {};
    this.config = config;
    this.config.childrenPropertyName = config.childrenPropertyName || 'children';
    this.config.modelComparatorFn = config.modelComparatorFn;
  }

  function addChildToNode(node, child) {
    child.parent = node;
    node.children.push(child);
    return child;
  }

  function Node(config, model) {
    this.config = config;
    this.model = model;
    this.children = [];
  }

  TreeModel.prototype.parse = function (model) {
    var i, childCount, node;

    if (!(model instanceof Object)) {
      throw new TypeError('Model must be of type object.');
    }

    node = new Node(this.config, model);
    node.model.id = uuidv4();
    node.model.data = {};
    if (model[this.config.childrenPropertyName] instanceof Array) {
      if (this.config.modelComparatorFn) {
        model[this.config.childrenPropertyName] = mergeSort(
          this.config.modelComparatorFn,
          model[this.config.childrenPropertyName]);
      }
      for (i = 0, childCount = model[this.config.childrenPropertyName].length; i < childCount; i++) {
        addChildToNode(node, this.parse(model[this.config.childrenPropertyName][i]));
      }
    }
    return node;
  };

  function hasComparatorFunction(node) {
    return typeof node.config.modelComparatorFn === 'function';
  }

  Node.prototype.isRoot = function () {
    return this.parent === undefined;
  };

  Node.prototype.hasChildren = function () {
    return this.children.length > 0;
  };

  function addChild(self, child, insertIndex) {
    var index;

    if (!(child instanceof Node)) {
      throw new TypeError('Child must be of type Node.');
    }

    child.parent = self;
    if (!(self.model[self.config.childrenPropertyName] instanceof Array)) {
      self.model[self.config.childrenPropertyName] = [];
    }

    if (hasComparatorFunction(self)) {
      // Find the index to insert the child
      index = findInsertIndex(
        self.config.modelComparatorFn,
        self.model[self.config.childrenPropertyName],
        child.model);

      // Add to the model children
      self.model[self.config.childrenPropertyName].splice(index, 0, child.model);

      // Add to the node children
      self.children.splice(index, 0, child);
    } else {
      if (insertIndex === undefined) {
        self.model[self.config.childrenPropertyName].push(child.model);
        self.children.push(child);
      } else {
        if (insertIndex < 0 || insertIndex > self.children.length) {
          throw new Error('Invalid index.');
        }
        self.model[self.config.childrenPropertyName].splice(insertIndex, 0, child.model);
        self.children.splice(insertIndex, 0, child);
      }
    }
    return child;
  }

  Node.prototype.addChild = function (child) {
    return addChild(this, child);
  };

  Node.prototype.addChildAtIndex = function (child, index) {
    if (hasComparatorFunction(this)) {
      throw new Error('Cannot add child at index when using a comparator function.');
    }

    return addChild(this, child, index);
  };

  Node.prototype.setIndex = function (index) {
    if (hasComparatorFunction(this)) {
      throw new Error('Cannot set node index when using a comparator function.');
    }

    if (this.isRoot()) {
      if (index === 0) {
        return this;
      }
      throw new Error('Invalid index.');
    }

    if (index < 0 || index >= this.parent.children.length) {
      throw new Error('Invalid index.');
    }

    var oldIndex = this.parent.children.indexOf(this);

    this.parent.children.splice(index, 0, this.parent.children.splice(oldIndex, 1)[0]);

    this.parent.model[this.parent.config.childrenPropertyName]
      .splice(index, 0, this.parent.model[this.parent.config.childrenPropertyName].splice(oldIndex, 1)[0]);

    return this;
  };

  Node.prototype.getPath = function () {
    var path = [];
    (function addToPath(node) {
      path.unshift(node);
      if (!node.isRoot()) {
        addToPath(node.parent);
      }
    })(this);
    return path;
  };

  Node.prototype.getIndex = function () {
    if (this.isRoot()) {
      return 0;
    }
    return this.parent.children.indexOf(this);
  };

  /**
   * Parse the arguments of traversal functions. These functions can take one optional
   * first argument which is an options object. If present, this object will be stored
   * in args.options. The only mandatory argument is the callback function which can
   * appear in the first or second position (if an options object is given). This
   * function will be saved to args.fn. The last optional argument is the context on
   * which the callback function will be called. It will be available in args.ctx.
   *
   * @returns Parsed arguments.
   */
  function parseArgs() {
    var args = {};
    if (arguments.length === 1) {
      args.fn = arguments[0];
    } else if (arguments.length === 2) {
      args.fnFilter = arguments[0];
      args.fn = arguments[1];
    } else {
      args.fnFilter = arguments[0];
      args.fn = arguments[1];
      args.ctx = arguments[2];
    }
    args.options = args.options || {};
    args.options.strategy = 'breadth';
    if (!walkStrategies[args.options.strategy]) {
      throw new Error('Unknown tree walk strategy. Valid strategies are \'pre\' [default], \'post\' and \'breadth\'.');
    }
    args.fnFilter = args.fnFilter || k(true);
    return args;
  }

  Node.prototype.walk = function () {
    var args;
    args = parseArgs.apply(this, arguments);
    walkStrategies[args.options.strategy].call(this, args.fn, args.ctx, args.fnFilter);
  };

  walkStrategies.breadth = function breadthFirst(callback, context, fnFilter) {
    var queue = new Denque([this]);
    (function processQueue() {
      var i, childCount, node;
      if (queue.length === 0) {
        return;
      }
      node = queue.shift();

      var callbackResult = callback.call(context, node);

      if (callbackResult) {
        if (callbackResult.added && callbackResult.added.length) {
          for (var i = callbackResult.added.length - 1; i >= 0 ; i--) {
            queue.unshift(callbackResult.added[i]);
          }
        }
      }

      for (i = 0, childCount = node.children.length; i < childCount; i++) {
        if (fnFilter(node.children[i]) !== true) {
          continue;
        }

        if (callbackResult) {
          if (callbackResult.deleted && callbackResult.deleted.length) {
            if (callbackResult.deleted.includes(node.children[i].model.id)) {
              continue;
            }
          }
        }

        queue.push(node.children[i]);
      }

      if (callbackResult !== false) {
        processQueue();
      }
    })();
  };

  Node.prototype.all = function () {
    var args, all = [];
    args = parseArgs.apply(this, arguments);
    args.fn = args.fn || k(true);
    walkStrategies[args.options.strategy].call(this, function (node) {
      if (args.fn.call(args.ctx, node)) {
        all.push(node);
      }
    }, args.ctx);
    return all;
  };

  Node.prototype.first = function () {
    var args, first;
    args = parseArgs.apply(this, arguments);
    args.fn = args.fn || k(true);
    walkStrategies[args.options.strategy].call(this, function (node) {
      if (args.fn.call(args.ctx, node)) {
        first = node;
        return false;
      }
    }, args.ctx);
    return first;
  };

  Node.prototype.drop = function () {
    var indexOfChild;
    if (!this.isRoot()) {
      indexOfChild = this.parent.children.indexOf(this);
      this.parent.children.splice(indexOfChild, 1);
      this.parent.model[this.config.childrenPropertyName].splice(indexOfChild, 1);
      this.parent = undefined;
      delete this.parent;
    }
    return this;
  };

  return TreeModel;
})();
