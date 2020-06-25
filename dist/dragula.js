(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.dragula = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var cache = {};
var start = '(?:^|\\s)';
var end = '(?:\\s|$)';

function lookupClass (className) {
  var cached = cache[className];
  if (cached) {
    cached.lastIndex = 0;
  } else {
    cache[className] = cached = new RegExp(start + className + end, 'g');
  }
  return cached;
}

function addClass (el, className) {
  var current = el.className;
  if (!current.length) {
    el.className = className;
  } else if (!lookupClass(className).test(current)) {
    el.className += ' ' + className;
  }
}

function rmClass (el, className) {
  el.className = el.className.replace(lookupClass(className), ' ').trim();
}

module.exports = {
  add: addClass,
  rm: rmClass
};

},{}],2:[function(require,module,exports){
(function (global){
'use strict';

var emitter = require('contra/emitter');
var crossvent = require('crossvent');
var classes = require('./classes');
var doc = document;
var documentElement = doc.documentElement;
var animateDuration = 300;

function dragula (initialContainers, options) {
  var len = arguments.length;
  if (len === 1 && Array.isArray(initialContainers) === false) {
    options = initialContainers;
    initialContainers = [];
  }
  var _mirror; // mirror image
  var _source; // source container
  var _item; // item being dragged
  var _offsetX; // reference x
  var _offsetY; // reference y
  var _moveX; // reference move x
  var _moveY; // reference move y
  var _initialSibling; // reference sibling when grabbed
  var _currentSibling; // reference sibling now
  var _copy; // item used for copying
  var _renderTimer; // timer for setTimeout renderMirrorImage
  var _lastDropTarget = null; // last container item was over
  var _grabbed; // holds mousedown context until first mousemove

  var o = options || {};
  if (o.moves === void 0) { o.moves = always; }
  if (o.accepts === void 0) { o.accepts = always; }
  if (o.invalid === void 0) { o.invalid = invalidTarget; }
  if (o.containers === void 0) { o.containers = initialContainers || []; }
  if (o.isContainer === void 0) { o.isContainer = never; }
  if (o.copy === void 0) { o.copy = false; }
  if (o.copySortSource === void 0) { o.copySortSource = false; }
  if (o.revertOnSpill === void 0) { o.revertOnSpill = false; }
  if (o.removeOnSpill === void 0) { o.removeOnSpill = false; }
  if (o.direction === void 0) { o.direction = 'vertical'; }
  if (o.ignoreInputTextSelection === void 0) { o.ignoreInputTextSelection = true; }
  if (o.mirrorContainer === void 0) { o.mirrorContainer = doc.body; }
  if (o.staticClass === void 0) { o.staticClass = ''; }
  if (o.canDragContainer === void 0) { o.canDragContainer = false; }

  var drake = emitter({
    containers: o.containers,
    start: manualStart,
    end: end,
    cancel: cancel,
    remove: remove,
    destroy: destroy,
    canMove: canMove,
    dragging: false,
    animate: true
  });

  if (o.removeOnSpill === true) {
    drake.on('over', spillOver).on('out', spillOut);
  }

  events();

  return drake;

  function isContainer (el) {
    return drake.containers.indexOf(el) !== -1 || o.isContainer(el);
  }

  function events (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousedown', grab);
    touchy(documentElement, op, 'mouseup', release);
  }

  function eventualMovements (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousemove', startBecauseMouseMoved);
  }

  function movements (remove) {
    var op = remove ? 'remove' : 'add';
    crossvent[op](documentElement, 'selectstart', preventGrabbed); // IE8
    crossvent[op](documentElement, 'click', preventGrabbed);
  }

  function destroy () {
    events(true);
    release({});
  }

  function preventGrabbed (e) {
    if (_grabbed) {
      e.preventDefault();
    }
  }

  function grab (e) {
    _moveX = e.clientX;
    _moveY = e.clientY;

    var ignore = whichMouseButton(e) !== 1 || e.metaKey || e.ctrlKey;
    if (ignore) {
      return; // we only care about honest-to-god left clicks and touch events
    }
    var item = e.target;
    var context = canStart(item);
    if (!context) {
      return;
    }
    _grabbed = context;
    eventualMovements();
    if (e.type === 'mousedown') {
      if (isInput(item)) { // see also: https://github.com/bevacqua/dragula/issues/208
        item.focus(); // fixes https://github.com/bevacqua/dragula/issues/176
      } else {
        e.preventDefault(); // fixes https://github.com/bevacqua/dragula/issues/155
      }
    }
  }

  function startBecauseMouseMoved (e) {
    if (!_grabbed) {
      return;
    }
    if (whichMouseButton(e) === 0) {
      release({});
      return; // when text is selected on an input and then dragged, mouseup doesn't fire. this is our only hope
    }
    // truthy check fixes #239, equality fixes #207
    if (e.clientX !== void 0 && e.clientX === _moveX && e.clientY !== void 0 && e.clientY === _moveY) {
      return;
    }
    if (o.ignoreInputTextSelection) {
      var clientX = getCoord('clientX', e);
      var clientY = getCoord('clientY', e);
      var elementBehindCursor = doc.elementFromPoint(clientX, clientY);
      if (isInput(elementBehindCursor)) {
        return;
      }
    }

    var grabbed = _grabbed; // call to end() unsets _grabbed
    eventualMovements(true);
    movements();
    end();
    start(grabbed);

    var offset = getOffset(_item);
    _offsetX = getCoord('pageX', e) - offset.left;
    _offsetY = getCoord('pageY', e) - offset.top;

    classes.add(_copy || _item, 'gu-transit');
    renderMirrorImage();
    drag(e);
  }

  function canStart (item) {
    if (drake.dragging && _mirror) {
      return;
    }
    if (o.canDragContainer === false && isContainer(item)) {
      return; // don't drag container itself
    }
    var handle = item;
    while (getParent(item) && isContainer(getParent(item)) === false) {
      if (o.invalid(item, handle)) {
        return;
      }
      item = getParent(item); // drag target should be a top element
      if (!item) {
        return;
      }
    }
    var source = getParent(item);
    if (!source) {
      return;
    }

    if ((o.staticClass && item.classList.contains(o.staticClass))) {
      return;
    }

    if (o.invalid(item, handle)) {
      return;
    }

    var movable = o.moves(item, source, handle, nextEl(item));
    if (!movable) {
      return;
    }

    return {
      item: item,
      source: source
    };
  }

  function canMove (item) {
    return !!canStart(item);
  }

  function manualStart (item) {
    var context = canStart(item);
    if (context) {
      start(context);
    }
  }

  function start (context) {
    if (isCopy(context.item, context.source)) {
      _copy = context.item.cloneNode(true);
      drake.emit('cloned', _copy, context.item, 'copy');
    }

    _source = context.source;
    _item = context.item;
    _initialSibling = _currentSibling = nextEl(context.item);

    drake.dragging = true;
    drake.emit('drag', _item, _source);
  }

  function invalidTarget () {
    return false;
  }

  function end () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    drop(item, getParent(item));
  }

  function ungrab () {
    _grabbed = false;
    eventualMovements(true);
    movements(true);
  }

  function release (e) {
    ungrab();

    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    if (dropTarget && ((_copy && o.copySortSource) || (!_copy || dropTarget !== _source))) {
      drop(item, dropTarget);
    } else if (o.removeOnSpill) {
      remove();
    } else {
      cancel();
    }
  }

  function drop (item, target) {
    var parent = getParent(item);
    if (_copy && o.copySortSource && target === _source) {
      parent.removeChild(_item);
    }
    if (isInitialPlacement(target)) {
      drake.emit('cancel', item, _source, _source);
    } else {
      drake.emit('drop', item, target, _source, _currentSibling);
    }
    cleanup();
  }

  function remove () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var parent = getParent(item);
    if (parent) {
      parent.removeChild(item);
    }
    drake.emit(_copy ? 'cancel' : 'remove', item, parent, _source);
    cleanup();
  }

  function cancel (revert) {
    if (!drake.dragging) {
      return;
    }
    var reverts = arguments.length > 0 ? revert : o.revertOnSpill;
    var item = _copy || _item;
    var parent = getParent(item);
    var initial = isInitialPlacement(parent);
    if (initial === false && reverts) {
      if (_copy) {
        if (parent) {
          parent.removeChild(_copy);
        }
      } else {
        _source.insertBefore(item, _initialSibling);
      }
    }
    if (initial || reverts) {
      drake.emit('cancel', item, _source, _source);
    } else {
      drake.emit('drop', item, parent, _source, _currentSibling);
    }
    cleanup();
  }

  function cleanup () {
    var item = _copy || _item;
    ungrab();
    removeMirrorImage();
    if (item) {
      classes.rm(item, 'gu-transit');
    }
    if (_renderTimer) {
      clearTimeout(_renderTimer);
    }
    drake.dragging = false;
    if (_lastDropTarget) {
      drake.emit('out', item, _lastDropTarget, _source);
    }
    drake.emit('dragend', item);
    _source = _item = _copy = _initialSibling = _currentSibling = _renderTimer = _lastDropTarget = null;
  }

  function isInitialPlacement (target, s) {
    var sibling;
    if (s !== void 0) {
      sibling = s;
    } else if (_mirror) {
      sibling = _currentSibling;
    } else {
      sibling = nextEl(_copy || _item);
    }
    return target === _source && sibling === _initialSibling;
  }

  function findDropTarget (elementBehindCursor, clientX, clientY) {
    var target = elementBehindCursor;
    while (target && !accepted()) {
      target = getParent(target);
    }
    return target;

    function accepted () {
      var droppable = isContainer(target);
      if (droppable === false) {
        return false;
      }

      var immediate = getImmediateChild(target, elementBehindCursor);
      var reference = getReference(target, immediate, clientX, clientY);
      var initial = isInitialPlacement(target, reference);
      if (initial) {
        return true; // should always be able to drop it right back where it was
      }
      return o.accepts(_item, target, _source, reference);
    }
  }

  function drag (e) {
    // scroll container if any
    if (o.scrollContainer) {
      var offsetY = o.scrollContainer.getBoundingClientRect().y;
      if (e.clientY-offsetY < 100) {
        o.scrollContainer.scrollTo(0, o.scrollContainer.scrollTop - 6);
      } else if (e.clientY-offsetY > (o.scrollContainer.clientHeight - 100)) {
        o.scrollContainer.scrollTo(0, o.scrollContainer.scrollTop + 6);
      }
    }

    if (!_mirror) {
      return;
    }
    e.preventDefault();

    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var x = clientX - _offsetX;
    var y = clientY - _offsetY;

    _mirror.style.left = x + 'px';
    _mirror.style.top = y + 'px';

    var item = _copy || _item;
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    var changed = dropTarget !== null && dropTarget !== _lastDropTarget;
    if (changed || dropTarget === null) {
      out();
      _lastDropTarget = dropTarget;
      over();
    }
    var parent = getParent(item);
    if (dropTarget === _source && _copy && !o.copySortSource) {
      if (parent) {
        parent.removeChild(item);
      }
      return;
    }
    var reference;
    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
    if (immediate !== null) {
      reference = getReference(dropTarget, immediate, clientX, clientY);
    } else if (o.revertOnSpill === true && !_copy) {
      reference = _initialSibling;
      dropTarget = _source;
    } else {
      // if (_copy && parent) {
      //   parent.removeChild(item);
      // }
      return;
    }
    if (
      (reference === null && changed) ||
      reference !== item &&
      reference !== nextEl(item)
    ) {
      _currentSibling = reference;

      var itemRect = item.getBoundingClientRect();
      var referenceRect = reference ? reference.getBoundingClientRect() : null;
      var direct = o.direction;
      // if isPositive is true, the direction is right or down
      var isPositive;
      if (referenceRect) {
        isPositive = direct === 'horizontal' ? (itemRect.x < referenceRect.x) : (itemRect.y < referenceRect.y);
      }else{
        isPositive = true;
      }
      // mover is the element to be exchange passively
      var mover;
      if (isPositive) {
        mover = reference ? (reference.previousElementSibling ? reference.previousElementSibling : reference) : (dropTarget.lastElementChild ? dropTarget.lastElementChild : dropTarget);
      } else {
        mover = reference; //upward or right
      }
      if (!mover) {
        return;
      }
      if (o.staticClass && mover.classList.contains(o.staticClass)) {
        return;
      }
      var moverRect = mover && mover.getBoundingClientRect();
      try{
        dropTarget.insertBefore(item, reference);
        if (drake.animate && mover && moverRect) {
          animate(moverRect, mover);
          animate(itemRect, item);
        }
        drake.emit('shadow', item, dropTarget, _source);
      }catch(err){}
    }
    function moved (type) { drake.emit(type, item, _lastDropTarget, _source); }
    function over () { if (changed) { moved('over'); } }
    function out () { if (_lastDropTarget) { moved('out'); } }
  }

  function spillOver (el) {
    classes.rm(el, 'gu-hide');
  }

  function spillOut (el) {
    if (drake.dragging) { classes.add(el, 'gu-hide'); }
  }

  function renderMirrorImage () {
    if (_mirror) {
      return;
    }
    var rect = _item.getBoundingClientRect();
    _mirror = _item.cloneNode(true);
    _mirror.style.width = getRectWidth(rect) + 'px';
    _mirror.style.height = getRectHeight(rect) + 'px';
    classes.rm(_mirror, 'gu-transit');
    classes.add(_mirror, 'gu-mirror');
    if (typeof o.mirrorContainer === 'function') { o.mirrorContainer = o.mirrorContainer(); }
    o.mirrorContainer.appendChild(_mirror);
    if (typeof o.scrollContainer === 'function') { o.scrollContainer = o.scrollContainer(); }
    touchy(documentElement, 'add', 'mousemove', drag);
    classes.add(o.mirrorContainer, 'gu-unselectable');
    drake.emit('cloned', _mirror, _item, 'mirror');
  }

  function removeMirrorImage () {
    if (_mirror) {
      classes.rm(o.mirrorContainer, 'gu-unselectable');
      touchy(documentElement, 'remove', 'mousemove', drag);
      getParent(_mirror).removeChild(_mirror);
      _mirror = null;
    }
  }

  function getImmediateChild (dropTarget, target) {
    var immediate = target;
    while (immediate !== dropTarget && getParent(immediate) !== dropTarget) {
      immediate = getParent(immediate);
    }
    if (immediate === documentElement) {
      return null;
    }
    return immediate;
  }

  function getReference (dropTarget, target, x, y) {
    var horizontal = o.direction === 'horizontal';
    var reference = target !== dropTarget ? inside() : outside();
    return reference;

    function outside () { // slower, but able to figure out any position
      var len = dropTarget.children.length;
      var i;
      var el;
      var rect;
      for (i = 0; i < len; i++) {
        el = dropTarget.children[i];
        rect = el.getBoundingClientRect();
        if (horizontal && (rect.left + rect.width / 2) > x) { return el; }
        if (!horizontal && (rect.top + rect.height / 2) > y) { return el; }
      }
      return null;
    }

    function inside () { // faster, but only available if dropped inside a child element
      var rect = target.getBoundingClientRect();
      if (horizontal) {
        return resolve(x > rect.left + getRectWidth(rect) / 2);
      }
      return resolve(y > rect.top + getRectHeight(rect) / 2);
    }

    function resolve (after) {
      return after ? nextEl(target) : target;
    }
  }

  function isCopy (item, container) {
    return typeof o.copy === 'boolean' ? o.copy : o.copy(item, container);
  }
}

function touchy (el, op, type, fn) {
  var touch = {
    mouseup: 'touchend',
    mousedown: 'touchstart',
    mousemove: 'touchmove'
  };
  var pointers = {
    mouseup: 'pointerup',
    mousedown: 'pointerdown',
    mousemove: 'pointermove'
  };
  var microsoft = {
    mouseup: 'MSPointerUp',
    mousedown: 'MSPointerDown',
    mousemove: 'MSPointerMove'
  };
  if (global.navigator.pointerEnabled) {
    crossvent[op](el, pointers[type], fn);
  } else if (global.navigator.msPointerEnabled) {
    crossvent[op](el, microsoft[type], fn);
  } else {
    crossvent[op](el, touch[type], fn);
    crossvent[op](el, type, fn);
  }
}

function whichMouseButton (e) {
  if (e.touches !== void 0) { return e.touches.length; }
  if (e.which !== void 0 && e.which !== 0) { return e.which; } // see https://github.com/bevacqua/dragula/issues/261
  if (e.buttons !== void 0) { return e.buttons; }
  var button = e.button;
  if (button !== void 0) { // see https://github.com/jquery/jquery/blob/99e8ff1baa7ae341e94bb89c3e84570c7c3ad9ea/src/event.js#L573-L575
    return button & 1 ? 1 : button & 2 ? 3 : (button & 4 ? 2 : 0);
  }
}

function getOffset (el) {
  var rect = el.getBoundingClientRect();
  return {
    left: rect.left + getScroll('scrollLeft', 'pageXOffset'),
    top: rect.top + getScroll('scrollTop', 'pageYOffset')
  };
}

function getScroll (scrollProp, offsetProp) {
  if (typeof global[offsetProp] !== 'undefined') {
    return global[offsetProp];
  }
  if (documentElement.clientHeight) {
    return documentElement[scrollProp];
  }
  return doc.body[scrollProp];
}

function getElementBehindPoint (point, x, y) {
  var p = point || {};
  var state = p.className;
  var el;
  p.className += ' gu-hide';
  el = doc.elementFromPoint(x, y);
  p.className = state;
  return el;
}

function never () { return false; }
function always () { return true; }
function getRectWidth (rect) { return rect.width || (rect.right - rect.left); }
function getRectHeight (rect) { return rect.height || (rect.bottom - rect.top); }
function getParent (el) { return el.parentNode === doc ? null : el.parentNode; }
function isInput (el) { return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || isEditable(el); }
function isEditable (el) {
  if (!el) { return false; } // no parents were editable
  if (el.contentEditable === 'false') { return false; } // stop the lookup
  if (el.contentEditable === 'true') { return true; } // found a contentEditable element in the chain
  return isEditable(getParent(el)); // contentEditable is set to 'inherit'
}

function nextEl (el) {
  return el.nextElementSibling || manually();
  function manually () {
    var sibling = el;
    do {
      sibling = sibling.nextSibling;
    } while (sibling && sibling.nodeType !== 1);
    return sibling;
  }
}

/**
 * Create an animation from position before sorting to present position
 * @param prevRect including element's position infomation before sorting
 * @param target element after sorting
 */
function animate (prevRect, target) {
  if (!prevRect || !target) {
    return;
  }
  var currentRect = target.getBoundingClientRect();
  var originProps = {transition: target.style.transition, transform: target.style.transform};
  Object.assign(target.style, {
    transition: 'none',
    transform: 'translate(' + (prevRect.left - currentRect.left) + 'px,' + (prevRect.top - currentRect.top) + 'px)'
  });
  target.offsetWidth; // repaint
  Object.assign(target.style, {transition: 'all ' + animateDuration + 'ms', transform: 'translate(0,0)'});
  clearTimeout(target.animated);
  target.animated = setTimeout(function () {
    Object.assign(target.style, {originProps: originProps});
    target.animated = false;
  }, animateDuration);
}


function getEventHost (e) {
  // on touchend event, we have to use `e.changedTouches`
  // see http://stackoverflow.com/questions/7192563/touchend-event-properties
  // see https://github.com/bevacqua/dragula/issues/34
  if (e.targetTouches && e.targetTouches.length) {
    return e.targetTouches[0];
  }
  if (e.changedTouches && e.changedTouches.length) {
    return e.changedTouches[0];
  }
  return e;
}

function getCoord (coord, e) {
  var host = getEventHost(e);
  var missMap = {
    pageX: 'clientX', // IE8
    pageY: 'clientY' // IE8
  };
  if (coord in missMap && !(coord in host) && missMap[coord] in host) {
    coord = missMap[coord];
  }
  return host[coord];
}

module.exports = dragula;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./classes":1,"contra/emitter":5,"crossvent":6}],3:[function(require,module,exports){
module.exports = function atoa (a, n) { return Array.prototype.slice.call(a, n); }

},{}],4:[function(require,module,exports){
'use strict';

var ticky = require('ticky');

module.exports = function debounce (fn, args, ctx) {
  if (!fn) { return; }
  ticky(function run () {
    fn.apply(ctx || null, args || []);
  });
};

},{"ticky":9}],5:[function(require,module,exports){
'use strict';

var atoa = require('atoa');
var debounce = require('./debounce');

module.exports = function emitter (thing, options) {
  var opts = options || {};
  var evt = {};
  if (thing === undefined) { thing = {}; }
  thing.on = function (type, fn) {
    if (!evt[type]) {
      evt[type] = [fn];
    } else {
      evt[type].push(fn);
    }
    return thing;
  };
  thing.once = function (type, fn) {
    fn._once = true; // thing.off(fn) still works!
    thing.on(type, fn);
    return thing;
  };
  thing.off = function (type, fn) {
    var c = arguments.length;
    if (c === 1) {
      delete evt[type];
    } else if (c === 0) {
      evt = {};
    } else {
      var et = evt[type];
      if (!et) { return thing; }
      et.splice(et.indexOf(fn), 1);
    }
    return thing;
  };
  thing.emit = function () {
    var args = atoa(arguments);
    return thing.emitterSnapshot(args.shift()).apply(this, args);
  };
  thing.emitterSnapshot = function (type) {
    var et = (evt[type] || []).slice(0);
    return function () {
      var args = atoa(arguments);
      var ctx = this || thing;
      if (type === 'error' && opts.throws !== false && !et.length) { throw args.length === 1 ? args[0] : args; }
      et.forEach(function emitter (listen) {
        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
        if (listen._once) { thing.off(type, listen); }
      });
      return thing;
    };
  };
  return thing;
};

},{"./debounce":4,"atoa":3}],6:[function(require,module,exports){
(function (global){
'use strict';

var customEvent = require('custom-event');
var eventmap = require('./eventmap');
var doc = global.document;
var addEvent = addEventEasy;
var removeEvent = removeEventEasy;
var hardCache = [];

if (!global.addEventListener) {
  addEvent = addEventHard;
  removeEvent = removeEventHard;
}

module.exports = {
  add: addEvent,
  remove: removeEvent,
  fabricate: fabricateEvent
};

function addEventEasy (el, type, fn, capturing) {
  return el.addEventListener(type, fn, capturing);
}

function addEventHard (el, type, fn) {
  return el.attachEvent('on' + type, wrap(el, type, fn));
}

function removeEventEasy (el, type, fn, capturing) {
  return el.removeEventListener(type, fn, capturing);
}

function removeEventHard (el, type, fn) {
  var listener = unwrap(el, type, fn);
  if (listener) {
    return el.detachEvent('on' + type, listener);
  }
}

function fabricateEvent (el, type, model) {
  var e = eventmap.indexOf(type) === -1 ? makeCustomEvent() : makeClassicEvent();
  if (el.dispatchEvent) {
    el.dispatchEvent(e);
  } else {
    el.fireEvent('on' + type, e);
  }
  function makeClassicEvent () {
    var e;
    if (doc.createEvent) {
      e = doc.createEvent('Event');
      e.initEvent(type, true, true);
    } else if (doc.createEventObject) {
      e = doc.createEventObject();
    }
    return e;
  }
  function makeCustomEvent () {
    return new customEvent(type, { detail: model });
  }
}

function wrapperFactory (el, type, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || global.event;
    e.target = e.target || e.srcElement;
    e.preventDefault = e.preventDefault || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    e.which = e.which || e.keyCode;
    fn.call(el, e);
  };
}

function wrap (el, type, fn) {
  var wrapper = unwrap(el, type, fn) || wrapperFactory(el, type, fn);
  hardCache.push({
    wrapper: wrapper,
    element: el,
    type: type,
    fn: fn
  });
  return wrapper;
}

function unwrap (el, type, fn) {
  var i = find(el, type, fn);
  if (i) {
    var wrapper = hardCache[i].wrapper;
    hardCache.splice(i, 1); // free up a tad of memory
    return wrapper;
  }
}

function find (el, type, fn) {
  var i, item;
  for (i = 0; i < hardCache.length; i++) {
    item = hardCache[i];
    if (item.element === el && item.type === type && item.fn === fn) {
      return i;
    }
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./eventmap":7,"custom-event":8}],7:[function(require,module,exports){
(function (global){
'use strict';

var eventmap = [];
var eventname = '';
var ron = /^on/;

for (eventname in global) {
  if (ron.test(eventname)) {
    eventmap.push(eventname.slice(2));
  }
}

module.exports = eventmap;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],8:[function(require,module,exports){
(function (global){

var NativeCustomEvent = global.CustomEvent;

function useNative () {
  try {
    var p = new NativeCustomEvent('cat', { detail: { foo: 'bar' } });
    return  'cat' === p.type && 'bar' === p.detail.foo;
  } catch (e) {
  }
  return false;
}

/**
 * Cross-browser `CustomEvent` constructor.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent.CustomEvent
 *
 * @public
 */

module.exports = useNative() ? NativeCustomEvent :

// IE >= 9
'function' === typeof document.createEvent ? function CustomEvent (type, params) {
  var e = document.createEvent('CustomEvent');
  if (params) {
    e.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);
  } else {
    e.initCustomEvent(type, false, false, void 0);
  }
  return e;
} :

// IE <= 8
function CustomEvent (type, params) {
  var e = document.createEventObject();
  e.type = type;
  if (params) {
    e.bubbles = Boolean(params.bubbles);
    e.cancelable = Boolean(params.cancelable);
    e.detail = params.detail;
  } else {
    e.bubbles = false;
    e.cancelable = false;
    e.detail = void 0;
  }
  return e;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],9:[function(require,module,exports){
var si = typeof setImmediate === 'function', tick;
if (si) {
  tick = function (fn) { setImmediate(fn); };
} else {
  tick = function (fn) { setTimeout(fn, 0); };
}

module.exports = tick;
},{}]},{},[2])(2)
});

//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJjbGFzc2VzLmpzIiwiZHJhZ3VsYS5qcyIsIm5vZGVfbW9kdWxlcy9hdG9hL2F0b2EuanMiLCJub2RlX21vZHVsZXMvY29udHJhL2RlYm91bmNlLmpzIiwibm9kZV9tb2R1bGVzL2NvbnRyYS9lbWl0dGVyLmpzIiwibm9kZV9tb2R1bGVzL2Nyb3NzdmVudC9zcmMvY3Jvc3N2ZW50LmpzIiwibm9kZV9tb2R1bGVzL2Nyb3NzdmVudC9zcmMvZXZlbnRtYXAuanMiLCJub2RlX21vZHVsZXMvY3VzdG9tLWV2ZW50L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpY2t5L3RpY2t5LWJyb3dzZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3cUJBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBjYWNoZSA9IHt9O1xyXG52YXIgc3RhcnQgPSAnKD86XnxcXFxccyknO1xyXG52YXIgZW5kID0gJyg/OlxcXFxzfCQpJztcclxuXHJcbmZ1bmN0aW9uIGxvb2t1cENsYXNzIChjbGFzc05hbWUpIHtcclxuICB2YXIgY2FjaGVkID0gY2FjaGVbY2xhc3NOYW1lXTtcclxuICBpZiAoY2FjaGVkKSB7XHJcbiAgICBjYWNoZWQubGFzdEluZGV4ID0gMDtcclxuICB9IGVsc2Uge1xyXG4gICAgY2FjaGVbY2xhc3NOYW1lXSA9IGNhY2hlZCA9IG5ldyBSZWdFeHAoc3RhcnQgKyBjbGFzc05hbWUgKyBlbmQsICdnJyk7XHJcbiAgfVxyXG4gIHJldHVybiBjYWNoZWQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZENsYXNzIChlbCwgY2xhc3NOYW1lKSB7XHJcbiAgdmFyIGN1cnJlbnQgPSBlbC5jbGFzc05hbWU7XHJcbiAgaWYgKCFjdXJyZW50Lmxlbmd0aCkge1xyXG4gICAgZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xyXG4gIH0gZWxzZSBpZiAoIWxvb2t1cENsYXNzKGNsYXNzTmFtZSkudGVzdChjdXJyZW50KSkge1xyXG4gICAgZWwuY2xhc3NOYW1lICs9ICcgJyArIGNsYXNzTmFtZTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJtQ2xhc3MgKGVsLCBjbGFzc05hbWUpIHtcclxuICBlbC5jbGFzc05hbWUgPSBlbC5jbGFzc05hbWUucmVwbGFjZShsb29rdXBDbGFzcyhjbGFzc05hbWUpLCAnICcpLnRyaW0oKTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgYWRkOiBhZGRDbGFzcyxcclxuICBybTogcm1DbGFzc1xyXG59O1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS9lbWl0dGVyJyk7XHJcbnZhciBjcm9zc3ZlbnQgPSByZXF1aXJlKCdjcm9zc3ZlbnQnKTtcclxudmFyIGNsYXNzZXMgPSByZXF1aXJlKCcuL2NsYXNzZXMnKTtcclxudmFyIGRvYyA9IGRvY3VtZW50O1xyXG52YXIgZG9jdW1lbnRFbGVtZW50ID0gZG9jLmRvY3VtZW50RWxlbWVudDtcclxudmFyIGFuaW1hdGVEdXJhdGlvbiA9IDMwMDtcclxuXHJcbmZ1bmN0aW9uIGRyYWd1bGEgKGluaXRpYWxDb250YWluZXJzLCBvcHRpb25zKSB7XHJcbiAgdmFyIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XHJcbiAgaWYgKGxlbiA9PT0gMSAmJiBBcnJheS5pc0FycmF5KGluaXRpYWxDb250YWluZXJzKSA9PT0gZmFsc2UpIHtcclxuICAgIG9wdGlvbnMgPSBpbml0aWFsQ29udGFpbmVycztcclxuICAgIGluaXRpYWxDb250YWluZXJzID0gW107XHJcbiAgfVxyXG4gIHZhciBfbWlycm9yOyAvLyBtaXJyb3IgaW1hZ2VcclxuICB2YXIgX3NvdXJjZTsgLy8gc291cmNlIGNvbnRhaW5lclxyXG4gIHZhciBfaXRlbTsgLy8gaXRlbSBiZWluZyBkcmFnZ2VkXHJcbiAgdmFyIF9vZmZzZXRYOyAvLyByZWZlcmVuY2UgeFxyXG4gIHZhciBfb2Zmc2V0WTsgLy8gcmVmZXJlbmNlIHlcclxuICB2YXIgX21vdmVYOyAvLyByZWZlcmVuY2UgbW92ZSB4XHJcbiAgdmFyIF9tb3ZlWTsgLy8gcmVmZXJlbmNlIG1vdmUgeVxyXG4gIHZhciBfaW5pdGlhbFNpYmxpbmc7IC8vIHJlZmVyZW5jZSBzaWJsaW5nIHdoZW4gZ3JhYmJlZFxyXG4gIHZhciBfY3VycmVudFNpYmxpbmc7IC8vIHJlZmVyZW5jZSBzaWJsaW5nIG5vd1xyXG4gIHZhciBfY29weTsgLy8gaXRlbSB1c2VkIGZvciBjb3B5aW5nXHJcbiAgdmFyIF9yZW5kZXJUaW1lcjsgLy8gdGltZXIgZm9yIHNldFRpbWVvdXQgcmVuZGVyTWlycm9ySW1hZ2VcclxuICB2YXIgX2xhc3REcm9wVGFyZ2V0ID0gbnVsbDsgLy8gbGFzdCBjb250YWluZXIgaXRlbSB3YXMgb3ZlclxyXG4gIHZhciBfZ3JhYmJlZDsgLy8gaG9sZHMgbW91c2Vkb3duIGNvbnRleHQgdW50aWwgZmlyc3QgbW91c2Vtb3ZlXHJcblxyXG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcclxuICBpZiAoby5tb3ZlcyA9PT0gdm9pZCAwKSB7IG8ubW92ZXMgPSBhbHdheXM7IH1cclxuICBpZiAoby5hY2NlcHRzID09PSB2b2lkIDApIHsgby5hY2NlcHRzID0gYWx3YXlzOyB9XHJcbiAgaWYgKG8uaW52YWxpZCA9PT0gdm9pZCAwKSB7IG8uaW52YWxpZCA9IGludmFsaWRUYXJnZXQ7IH1cclxuICBpZiAoby5jb250YWluZXJzID09PSB2b2lkIDApIHsgby5jb250YWluZXJzID0gaW5pdGlhbENvbnRhaW5lcnMgfHwgW107IH1cclxuICBpZiAoby5pc0NvbnRhaW5lciA9PT0gdm9pZCAwKSB7IG8uaXNDb250YWluZXIgPSBuZXZlcjsgfVxyXG4gIGlmIChvLmNvcHkgPT09IHZvaWQgMCkgeyBvLmNvcHkgPSBmYWxzZTsgfVxyXG4gIGlmIChvLmNvcHlTb3J0U291cmNlID09PSB2b2lkIDApIHsgby5jb3B5U29ydFNvdXJjZSA9IGZhbHNlOyB9XHJcbiAgaWYgKG8ucmV2ZXJ0T25TcGlsbCA9PT0gdm9pZCAwKSB7IG8ucmV2ZXJ0T25TcGlsbCA9IGZhbHNlOyB9XHJcbiAgaWYgKG8ucmVtb3ZlT25TcGlsbCA9PT0gdm9pZCAwKSB7IG8ucmVtb3ZlT25TcGlsbCA9IGZhbHNlOyB9XHJcbiAgaWYgKG8uZGlyZWN0aW9uID09PSB2b2lkIDApIHsgby5kaXJlY3Rpb24gPSAndmVydGljYWwnOyB9XHJcbiAgaWYgKG8uaWdub3JlSW5wdXRUZXh0U2VsZWN0aW9uID09PSB2b2lkIDApIHsgby5pZ25vcmVJbnB1dFRleHRTZWxlY3Rpb24gPSB0cnVlOyB9XHJcbiAgaWYgKG8ubWlycm9yQ29udGFpbmVyID09PSB2b2lkIDApIHsgby5taXJyb3JDb250YWluZXIgPSBkb2MuYm9keTsgfVxyXG4gIGlmIChvLnN0YXRpY0NsYXNzID09PSB2b2lkIDApIHsgby5zdGF0aWNDbGFzcyA9ICcnOyB9XHJcbiAgaWYgKG8uY2FuRHJhZ0NvbnRhaW5lciA9PT0gdm9pZCAwKSB7IG8uY2FuRHJhZ0NvbnRhaW5lciA9IGZhbHNlOyB9XHJcblxyXG4gIHZhciBkcmFrZSA9IGVtaXR0ZXIoe1xyXG4gICAgY29udGFpbmVyczogby5jb250YWluZXJzLFxyXG4gICAgc3RhcnQ6IG1hbnVhbFN0YXJ0LFxyXG4gICAgZW5kOiBlbmQsXHJcbiAgICBjYW5jZWw6IGNhbmNlbCxcclxuICAgIHJlbW92ZTogcmVtb3ZlLFxyXG4gICAgZGVzdHJveTogZGVzdHJveSxcclxuICAgIGNhbk1vdmU6IGNhbk1vdmUsXHJcbiAgICBkcmFnZ2luZzogZmFsc2UsXHJcbiAgICBhbmltYXRlOiB0cnVlXHJcbiAgfSk7XHJcblxyXG4gIGlmIChvLnJlbW92ZU9uU3BpbGwgPT09IHRydWUpIHtcclxuICAgIGRyYWtlLm9uKCdvdmVyJywgc3BpbGxPdmVyKS5vbignb3V0Jywgc3BpbGxPdXQpO1xyXG4gIH1cclxuXHJcbiAgZXZlbnRzKCk7XHJcblxyXG4gIHJldHVybiBkcmFrZTtcclxuXHJcbiAgZnVuY3Rpb24gaXNDb250YWluZXIgKGVsKSB7XHJcbiAgICByZXR1cm4gZHJha2UuY29udGFpbmVycy5pbmRleE9mKGVsKSAhPT0gLTEgfHwgby5pc0NvbnRhaW5lcihlbCk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBldmVudHMgKHJlbW92ZSkge1xyXG4gICAgdmFyIG9wID0gcmVtb3ZlID8gJ3JlbW92ZScgOiAnYWRkJztcclxuICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsIG9wLCAnbW91c2Vkb3duJywgZ3JhYik7XHJcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCBvcCwgJ21vdXNldXAnLCByZWxlYXNlKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGV2ZW50dWFsTW92ZW1lbnRzIChyZW1vdmUpIHtcclxuICAgIHZhciBvcCA9IHJlbW92ZSA/ICdyZW1vdmUnIDogJ2FkZCc7XHJcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCBvcCwgJ21vdXNlbW92ZScsIHN0YXJ0QmVjYXVzZU1vdXNlTW92ZWQpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gbW92ZW1lbnRzIChyZW1vdmUpIHtcclxuICAgIHZhciBvcCA9IHJlbW92ZSA/ICdyZW1vdmUnIDogJ2FkZCc7XHJcbiAgICBjcm9zc3ZlbnRbb3BdKGRvY3VtZW50RWxlbWVudCwgJ3NlbGVjdHN0YXJ0JywgcHJldmVudEdyYWJiZWQpOyAvLyBJRThcclxuICAgIGNyb3NzdmVudFtvcF0oZG9jdW1lbnRFbGVtZW50LCAnY2xpY2snLCBwcmV2ZW50R3JhYmJlZCk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcclxuICAgIGV2ZW50cyh0cnVlKTtcclxuICAgIHJlbGVhc2Uoe30pO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcHJldmVudEdyYWJiZWQgKGUpIHtcclxuICAgIGlmIChfZ3JhYmJlZCkge1xyXG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBncmFiIChlKSB7XHJcbiAgICBfbW92ZVggPSBlLmNsaWVudFg7XHJcbiAgICBfbW92ZVkgPSBlLmNsaWVudFk7XHJcblxyXG4gICAgdmFyIGlnbm9yZSA9IHdoaWNoTW91c2VCdXR0b24oZSkgIT09IDEgfHwgZS5tZXRhS2V5IHx8IGUuY3RybEtleTtcclxuICAgIGlmIChpZ25vcmUpIHtcclxuICAgICAgcmV0dXJuOyAvLyB3ZSBvbmx5IGNhcmUgYWJvdXQgaG9uZXN0LXRvLWdvZCBsZWZ0IGNsaWNrcyBhbmQgdG91Y2ggZXZlbnRzXHJcbiAgICB9XHJcbiAgICB2YXIgaXRlbSA9IGUudGFyZ2V0O1xyXG4gICAgdmFyIGNvbnRleHQgPSBjYW5TdGFydChpdGVtKTtcclxuICAgIGlmICghY29udGV4dCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBfZ3JhYmJlZCA9IGNvbnRleHQ7XHJcbiAgICBldmVudHVhbE1vdmVtZW50cygpO1xyXG4gICAgaWYgKGUudHlwZSA9PT0gJ21vdXNlZG93bicpIHtcclxuICAgICAgaWYgKGlzSW5wdXQoaXRlbSkpIHsgLy8gc2VlIGFsc286IGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8yMDhcclxuICAgICAgICBpdGVtLmZvY3VzKCk7IC8vIGZpeGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8xNzZcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IC8vIGZpeGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8xNTVcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3RhcnRCZWNhdXNlTW91c2VNb3ZlZCAoZSkge1xyXG4gICAgaWYgKCFfZ3JhYmJlZCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAod2hpY2hNb3VzZUJ1dHRvbihlKSA9PT0gMCkge1xyXG4gICAgICByZWxlYXNlKHt9KTtcclxuICAgICAgcmV0dXJuOyAvLyB3aGVuIHRleHQgaXMgc2VsZWN0ZWQgb24gYW4gaW5wdXQgYW5kIHRoZW4gZHJhZ2dlZCwgbW91c2V1cCBkb2Vzbid0IGZpcmUuIHRoaXMgaXMgb3VyIG9ubHkgaG9wZVxyXG4gICAgfVxyXG4gICAgLy8gdHJ1dGh5IGNoZWNrIGZpeGVzICMyMzksIGVxdWFsaXR5IGZpeGVzICMyMDdcclxuICAgIGlmIChlLmNsaWVudFggIT09IHZvaWQgMCAmJiBlLmNsaWVudFggPT09IF9tb3ZlWCAmJiBlLmNsaWVudFkgIT09IHZvaWQgMCAmJiBlLmNsaWVudFkgPT09IF9tb3ZlWSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoby5pZ25vcmVJbnB1dFRleHRTZWxlY3Rpb24pIHtcclxuICAgICAgdmFyIGNsaWVudFggPSBnZXRDb29yZCgnY2xpZW50WCcsIGUpO1xyXG4gICAgICB2YXIgY2xpZW50WSA9IGdldENvb3JkKCdjbGllbnRZJywgZSk7XHJcbiAgICAgIHZhciBlbGVtZW50QmVoaW5kQ3Vyc29yID0gZG9jLmVsZW1lbnRGcm9tUG9pbnQoY2xpZW50WCwgY2xpZW50WSk7XHJcbiAgICAgIGlmIChpc0lucHV0KGVsZW1lbnRCZWhpbmRDdXJzb3IpKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGdyYWJiZWQgPSBfZ3JhYmJlZDsgLy8gY2FsbCB0byBlbmQoKSB1bnNldHMgX2dyYWJiZWRcclxuICAgIGV2ZW50dWFsTW92ZW1lbnRzKHRydWUpO1xyXG4gICAgbW92ZW1lbnRzKCk7XHJcbiAgICBlbmQoKTtcclxuICAgIHN0YXJ0KGdyYWJiZWQpO1xyXG5cclxuICAgIHZhciBvZmZzZXQgPSBnZXRPZmZzZXQoX2l0ZW0pO1xyXG4gICAgX29mZnNldFggPSBnZXRDb29yZCgncGFnZVgnLCBlKSAtIG9mZnNldC5sZWZ0O1xyXG4gICAgX29mZnNldFkgPSBnZXRDb29yZCgncGFnZVknLCBlKSAtIG9mZnNldC50b3A7XHJcblxyXG4gICAgY2xhc3Nlcy5hZGQoX2NvcHkgfHwgX2l0ZW0sICdndS10cmFuc2l0Jyk7XHJcbiAgICByZW5kZXJNaXJyb3JJbWFnZSgpO1xyXG4gICAgZHJhZyhlKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNhblN0YXJ0IChpdGVtKSB7XHJcbiAgICBpZiAoZHJha2UuZHJhZ2dpbmcgJiYgX21pcnJvcikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoby5jYW5EcmFnQ29udGFpbmVyID09PSBmYWxzZSAmJiBpc0NvbnRhaW5lcihpdGVtKSkge1xyXG4gICAgICByZXR1cm47IC8vIGRvbid0IGRyYWcgY29udGFpbmVyIGl0c2VsZlxyXG4gICAgfVxyXG4gICAgdmFyIGhhbmRsZSA9IGl0ZW07XHJcbiAgICB3aGlsZSAoZ2V0UGFyZW50KGl0ZW0pICYmIGlzQ29udGFpbmVyKGdldFBhcmVudChpdGVtKSkgPT09IGZhbHNlKSB7XHJcbiAgICAgIGlmIChvLmludmFsaWQoaXRlbSwgaGFuZGxlKSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBpdGVtID0gZ2V0UGFyZW50KGl0ZW0pOyAvLyBkcmFnIHRhcmdldCBzaG91bGQgYmUgYSB0b3AgZWxlbWVudFxyXG4gICAgICBpZiAoIWl0ZW0pIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHZhciBzb3VyY2UgPSBnZXRQYXJlbnQoaXRlbSk7XHJcbiAgICBpZiAoIXNvdXJjZSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKChvLnN0YXRpY0NsYXNzICYmIGl0ZW0uY2xhc3NMaXN0LmNvbnRhaW5zKG8uc3RhdGljQ2xhc3MpKSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG8uaW52YWxpZChpdGVtLCBoYW5kbGUpKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgbW92YWJsZSA9IG8ubW92ZXMoaXRlbSwgc291cmNlLCBoYW5kbGUsIG5leHRFbChpdGVtKSk7XHJcbiAgICBpZiAoIW1vdmFibGUpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGl0ZW06IGl0ZW0sXHJcbiAgICAgIHNvdXJjZTogc291cmNlXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY2FuTW92ZSAoaXRlbSkge1xyXG4gICAgcmV0dXJuICEhY2FuU3RhcnQoaXRlbSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBtYW51YWxTdGFydCAoaXRlbSkge1xyXG4gICAgdmFyIGNvbnRleHQgPSBjYW5TdGFydChpdGVtKTtcclxuICAgIGlmIChjb250ZXh0KSB7XHJcbiAgICAgIHN0YXJ0KGNvbnRleHQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3RhcnQgKGNvbnRleHQpIHtcclxuICAgIGlmIChpc0NvcHkoY29udGV4dC5pdGVtLCBjb250ZXh0LnNvdXJjZSkpIHtcclxuICAgICAgX2NvcHkgPSBjb250ZXh0Lml0ZW0uY2xvbmVOb2RlKHRydWUpO1xyXG4gICAgICBkcmFrZS5lbWl0KCdjbG9uZWQnLCBfY29weSwgY29udGV4dC5pdGVtLCAnY29weScpO1xyXG4gICAgfVxyXG5cclxuICAgIF9zb3VyY2UgPSBjb250ZXh0LnNvdXJjZTtcclxuICAgIF9pdGVtID0gY29udGV4dC5pdGVtO1xyXG4gICAgX2luaXRpYWxTaWJsaW5nID0gX2N1cnJlbnRTaWJsaW5nID0gbmV4dEVsKGNvbnRleHQuaXRlbSk7XHJcblxyXG4gICAgZHJha2UuZHJhZ2dpbmcgPSB0cnVlO1xyXG4gICAgZHJha2UuZW1pdCgnZHJhZycsIF9pdGVtLCBfc291cmNlKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGludmFsaWRUYXJnZXQgKCkge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW5kICgpIHtcclxuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcclxuICAgIGRyb3AoaXRlbSwgZ2V0UGFyZW50KGl0ZW0pKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHVuZ3JhYiAoKSB7XHJcbiAgICBfZ3JhYmJlZCA9IGZhbHNlO1xyXG4gICAgZXZlbnR1YWxNb3ZlbWVudHModHJ1ZSk7XHJcbiAgICBtb3ZlbWVudHModHJ1ZSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZWxlYXNlIChlKSB7XHJcbiAgICB1bmdyYWIoKTtcclxuXHJcbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XHJcbiAgICB2YXIgY2xpZW50WCA9IGdldENvb3JkKCdjbGllbnRYJywgZSk7XHJcbiAgICB2YXIgY2xpZW50WSA9IGdldENvb3JkKCdjbGllbnRZJywgZSk7XHJcbiAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGdldEVsZW1lbnRCZWhpbmRQb2ludChfbWlycm9yLCBjbGllbnRYLCBjbGllbnRZKTtcclxuICAgIHZhciBkcm9wVGFyZ2V0ID0gZmluZERyb3BUYXJnZXQoZWxlbWVudEJlaGluZEN1cnNvciwgY2xpZW50WCwgY2xpZW50WSk7XHJcbiAgICBpZiAoZHJvcFRhcmdldCAmJiAoKF9jb3B5ICYmIG8uY29weVNvcnRTb3VyY2UpIHx8ICghX2NvcHkgfHwgZHJvcFRhcmdldCAhPT0gX3NvdXJjZSkpKSB7XHJcbiAgICAgIGRyb3AoaXRlbSwgZHJvcFRhcmdldCk7XHJcbiAgICB9IGVsc2UgaWYgKG8ucmVtb3ZlT25TcGlsbCkge1xyXG4gICAgICByZW1vdmUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNhbmNlbCgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZHJvcCAoaXRlbSwgdGFyZ2V0KSB7XHJcbiAgICB2YXIgcGFyZW50ID0gZ2V0UGFyZW50KGl0ZW0pO1xyXG4gICAgaWYgKF9jb3B5ICYmIG8uY29weVNvcnRTb3VyY2UgJiYgdGFyZ2V0ID09PSBfc291cmNlKSB7XHJcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChfaXRlbSk7XHJcbiAgICB9XHJcbiAgICBpZiAoaXNJbml0aWFsUGxhY2VtZW50KHRhcmdldCkpIHtcclxuICAgICAgZHJha2UuZW1pdCgnY2FuY2VsJywgaXRlbSwgX3NvdXJjZSwgX3NvdXJjZSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBkcmFrZS5lbWl0KCdkcm9wJywgaXRlbSwgdGFyZ2V0LCBfc291cmNlLCBfY3VycmVudFNpYmxpbmcpO1xyXG4gICAgfVxyXG4gICAgY2xlYW51cCgpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcmVtb3ZlICgpIHtcclxuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcclxuICAgIHZhciBwYXJlbnQgPSBnZXRQYXJlbnQoaXRlbSk7XHJcbiAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChpdGVtKTtcclxuICAgIH1cclxuICAgIGRyYWtlLmVtaXQoX2NvcHkgPyAnY2FuY2VsJyA6ICdyZW1vdmUnLCBpdGVtLCBwYXJlbnQsIF9zb3VyY2UpO1xyXG4gICAgY2xlYW51cCgpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY2FuY2VsIChyZXZlcnQpIHtcclxuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgdmFyIHJldmVydHMgPSBhcmd1bWVudHMubGVuZ3RoID4gMCA/IHJldmVydCA6IG8ucmV2ZXJ0T25TcGlsbDtcclxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XHJcbiAgICB2YXIgcGFyZW50ID0gZ2V0UGFyZW50KGl0ZW0pO1xyXG4gICAgdmFyIGluaXRpYWwgPSBpc0luaXRpYWxQbGFjZW1lbnQocGFyZW50KTtcclxuICAgIGlmIChpbml0aWFsID09PSBmYWxzZSAmJiByZXZlcnRzKSB7XHJcbiAgICAgIGlmIChfY29weSkge1xyXG4gICAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChfY29weSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIF9zb3VyY2UuaW5zZXJ0QmVmb3JlKGl0ZW0sIF9pbml0aWFsU2libGluZyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChpbml0aWFsIHx8IHJldmVydHMpIHtcclxuICAgICAgZHJha2UuZW1pdCgnY2FuY2VsJywgaXRlbSwgX3NvdXJjZSwgX3NvdXJjZSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBkcmFrZS5lbWl0KCdkcm9wJywgaXRlbSwgcGFyZW50LCBfc291cmNlLCBfY3VycmVudFNpYmxpbmcpO1xyXG4gICAgfVxyXG4gICAgY2xlYW51cCgpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY2xlYW51cCAoKSB7XHJcbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xyXG4gICAgdW5ncmFiKCk7XHJcbiAgICByZW1vdmVNaXJyb3JJbWFnZSgpO1xyXG4gICAgaWYgKGl0ZW0pIHtcclxuICAgICAgY2xhc3Nlcy5ybShpdGVtLCAnZ3UtdHJhbnNpdCcpO1xyXG4gICAgfVxyXG4gICAgaWYgKF9yZW5kZXJUaW1lcikge1xyXG4gICAgICBjbGVhclRpbWVvdXQoX3JlbmRlclRpbWVyKTtcclxuICAgIH1cclxuICAgIGRyYWtlLmRyYWdnaW5nID0gZmFsc2U7XHJcbiAgICBpZiAoX2xhc3REcm9wVGFyZ2V0KSB7XHJcbiAgICAgIGRyYWtlLmVtaXQoJ291dCcsIGl0ZW0sIF9sYXN0RHJvcFRhcmdldCwgX3NvdXJjZSk7XHJcbiAgICB9XHJcbiAgICBkcmFrZS5lbWl0KCdkcmFnZW5kJywgaXRlbSk7XHJcbiAgICBfc291cmNlID0gX2l0ZW0gPSBfY29weSA9IF9pbml0aWFsU2libGluZyA9IF9jdXJyZW50U2libGluZyA9IF9yZW5kZXJUaW1lciA9IF9sYXN0RHJvcFRhcmdldCA9IG51bGw7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpc0luaXRpYWxQbGFjZW1lbnQgKHRhcmdldCwgcykge1xyXG4gICAgdmFyIHNpYmxpbmc7XHJcbiAgICBpZiAocyAhPT0gdm9pZCAwKSB7XHJcbiAgICAgIHNpYmxpbmcgPSBzO1xyXG4gICAgfSBlbHNlIGlmIChfbWlycm9yKSB7XHJcbiAgICAgIHNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzaWJsaW5nID0gbmV4dEVsKF9jb3B5IHx8IF9pdGVtKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0YXJnZXQgPT09IF9zb3VyY2UgJiYgc2libGluZyA9PT0gX2luaXRpYWxTaWJsaW5nO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZmluZERyb3BUYXJnZXQgKGVsZW1lbnRCZWhpbmRDdXJzb3IsIGNsaWVudFgsIGNsaWVudFkpIHtcclxuICAgIHZhciB0YXJnZXQgPSBlbGVtZW50QmVoaW5kQ3Vyc29yO1xyXG4gICAgd2hpbGUgKHRhcmdldCAmJiAhYWNjZXB0ZWQoKSkge1xyXG4gICAgICB0YXJnZXQgPSBnZXRQYXJlbnQodGFyZ2V0KTtcclxuICAgIH1cclxuICAgIHJldHVybiB0YXJnZXQ7XHJcblxyXG4gICAgZnVuY3Rpb24gYWNjZXB0ZWQgKCkge1xyXG4gICAgICB2YXIgZHJvcHBhYmxlID0gaXNDb250YWluZXIodGFyZ2V0KTtcclxuICAgICAgaWYgKGRyb3BwYWJsZSA9PT0gZmFsc2UpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHZhciBpbW1lZGlhdGUgPSBnZXRJbW1lZGlhdGVDaGlsZCh0YXJnZXQsIGVsZW1lbnRCZWhpbmRDdXJzb3IpO1xyXG4gICAgICB2YXIgcmVmZXJlbmNlID0gZ2V0UmVmZXJlbmNlKHRhcmdldCwgaW1tZWRpYXRlLCBjbGllbnRYLCBjbGllbnRZKTtcclxuICAgICAgdmFyIGluaXRpYWwgPSBpc0luaXRpYWxQbGFjZW1lbnQodGFyZ2V0LCByZWZlcmVuY2UpO1xyXG4gICAgICBpZiAoaW5pdGlhbCkge1xyXG4gICAgICAgIHJldHVybiB0cnVlOyAvLyBzaG91bGQgYWx3YXlzIGJlIGFibGUgdG8gZHJvcCBpdCByaWdodCBiYWNrIHdoZXJlIGl0IHdhc1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBvLmFjY2VwdHMoX2l0ZW0sIHRhcmdldCwgX3NvdXJjZSwgcmVmZXJlbmNlKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGRyYWcgKGUpIHtcclxuICAgIC8vIHNjcm9sbCBjb250YWluZXIgaWYgYW55XHJcbiAgICBpZiAoby5zY3JvbGxDb250YWluZXIpIHtcclxuICAgICAgdmFyIG9mZnNldFkgPSBvLnNjcm9sbENvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS55O1xyXG4gICAgICBpZiAoZS5jbGllbnRZLW9mZnNldFkgPCAxMDApIHtcclxuICAgICAgICBvLnNjcm9sbENvbnRhaW5lci5zY3JvbGxUbygwLCBvLnNjcm9sbENvbnRhaW5lci5zY3JvbGxUb3AgLSA2KTtcclxuICAgICAgfSBlbHNlIGlmIChlLmNsaWVudFktb2Zmc2V0WSA+IChvLnNjcm9sbENvbnRhaW5lci5jbGllbnRIZWlnaHQgLSAxMDApKSB7XHJcbiAgICAgICAgby5zY3JvbGxDb250YWluZXIuc2Nyb2xsVG8oMCwgby5zY3JvbGxDb250YWluZXIuc2Nyb2xsVG9wICsgNik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIV9taXJyb3IpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgIHZhciBjbGllbnRYID0gZ2V0Q29vcmQoJ2NsaWVudFgnLCBlKTtcclxuICAgIHZhciBjbGllbnRZID0gZ2V0Q29vcmQoJ2NsaWVudFknLCBlKTtcclxuICAgIHZhciB4ID0gY2xpZW50WCAtIF9vZmZzZXRYO1xyXG4gICAgdmFyIHkgPSBjbGllbnRZIC0gX29mZnNldFk7XHJcblxyXG4gICAgX21pcnJvci5zdHlsZS5sZWZ0ID0geCArICdweCc7XHJcbiAgICBfbWlycm9yLnN0eWxlLnRvcCA9IHkgKyAncHgnO1xyXG5cclxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XHJcbiAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGdldEVsZW1lbnRCZWhpbmRQb2ludChfbWlycm9yLCBjbGllbnRYLCBjbGllbnRZKTtcclxuICAgIHZhciBkcm9wVGFyZ2V0ID0gZmluZERyb3BUYXJnZXQoZWxlbWVudEJlaGluZEN1cnNvciwgY2xpZW50WCwgY2xpZW50WSk7XHJcbiAgICB2YXIgY2hhbmdlZCA9IGRyb3BUYXJnZXQgIT09IG51bGwgJiYgZHJvcFRhcmdldCAhPT0gX2xhc3REcm9wVGFyZ2V0O1xyXG4gICAgaWYgKGNoYW5nZWQgfHwgZHJvcFRhcmdldCA9PT0gbnVsbCkge1xyXG4gICAgICBvdXQoKTtcclxuICAgICAgX2xhc3REcm9wVGFyZ2V0ID0gZHJvcFRhcmdldDtcclxuICAgICAgb3ZlcigpO1xyXG4gICAgfVxyXG4gICAgdmFyIHBhcmVudCA9IGdldFBhcmVudChpdGVtKTtcclxuICAgIGlmIChkcm9wVGFyZ2V0ID09PSBfc291cmNlICYmIF9jb3B5ICYmICFvLmNvcHlTb3J0U291cmNlKSB7XHJcbiAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQoaXRlbSk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgdmFyIHJlZmVyZW5jZTtcclxuICAgIHZhciBpbW1lZGlhdGUgPSBnZXRJbW1lZGlhdGVDaGlsZChkcm9wVGFyZ2V0LCBlbGVtZW50QmVoaW5kQ3Vyc29yKTtcclxuICAgIGlmIChpbW1lZGlhdGUgIT09IG51bGwpIHtcclxuICAgICAgcmVmZXJlbmNlID0gZ2V0UmVmZXJlbmNlKGRyb3BUYXJnZXQsIGltbWVkaWF0ZSwgY2xpZW50WCwgY2xpZW50WSk7XHJcbiAgICB9IGVsc2UgaWYgKG8ucmV2ZXJ0T25TcGlsbCA9PT0gdHJ1ZSAmJiAhX2NvcHkpIHtcclxuICAgICAgcmVmZXJlbmNlID0gX2luaXRpYWxTaWJsaW5nO1xyXG4gICAgICBkcm9wVGFyZ2V0ID0gX3NvdXJjZTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIGlmIChfY29weSAmJiBwYXJlbnQpIHtcclxuICAgICAgLy8gICBwYXJlbnQucmVtb3ZlQ2hpbGQoaXRlbSk7XHJcbiAgICAgIC8vIH1cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKFxyXG4gICAgICAocmVmZXJlbmNlID09PSBudWxsICYmIGNoYW5nZWQpIHx8XHJcbiAgICAgIHJlZmVyZW5jZSAhPT0gaXRlbSAmJlxyXG4gICAgICByZWZlcmVuY2UgIT09IG5leHRFbChpdGVtKVxyXG4gICAgKSB7XHJcbiAgICAgIF9jdXJyZW50U2libGluZyA9IHJlZmVyZW5jZTtcclxuXHJcbiAgICAgIHZhciBpdGVtUmVjdCA9IGl0ZW0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIHZhciByZWZlcmVuY2VSZWN0ID0gcmVmZXJlbmNlID8gcmVmZXJlbmNlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpIDogbnVsbDtcclxuICAgICAgdmFyIGRpcmVjdCA9IG8uZGlyZWN0aW9uO1xyXG4gICAgICAvLyBpZiBpc1Bvc2l0aXZlIGlzIHRydWUsIHRoZSBkaXJlY3Rpb24gaXMgcmlnaHQgb3IgZG93blxyXG4gICAgICB2YXIgaXNQb3NpdGl2ZTtcclxuICAgICAgaWYgKHJlZmVyZW5jZVJlY3QpIHtcclxuICAgICAgICBpc1Bvc2l0aXZlID0gZGlyZWN0ID09PSAnaG9yaXpvbnRhbCcgPyAoaXRlbVJlY3QueCA8IHJlZmVyZW5jZVJlY3QueCkgOiAoaXRlbVJlY3QueSA8IHJlZmVyZW5jZVJlY3QueSk7XHJcbiAgICAgIH1lbHNle1xyXG4gICAgICAgIGlzUG9zaXRpdmUgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIG1vdmVyIGlzIHRoZSBlbGVtZW50IHRvIGJlIGV4Y2hhbmdlIHBhc3NpdmVseVxyXG4gICAgICB2YXIgbW92ZXI7XHJcbiAgICAgIGlmIChpc1Bvc2l0aXZlKSB7XHJcbiAgICAgICAgbW92ZXIgPSByZWZlcmVuY2UgPyAocmVmZXJlbmNlLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgPyByZWZlcmVuY2UucHJldmlvdXNFbGVtZW50U2libGluZyA6IHJlZmVyZW5jZSkgOiAoZHJvcFRhcmdldC5sYXN0RWxlbWVudENoaWxkID8gZHJvcFRhcmdldC5sYXN0RWxlbWVudENoaWxkIDogZHJvcFRhcmdldCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbW92ZXIgPSByZWZlcmVuY2U7IC8vdXB3YXJkIG9yIHJpZ2h0XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCFtb3Zlcikge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBpZiAoby5zdGF0aWNDbGFzcyAmJiBtb3Zlci5jbGFzc0xpc3QuY29udGFpbnMoby5zdGF0aWNDbGFzcykpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgdmFyIG1vdmVyUmVjdCA9IG1vdmVyICYmIG1vdmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICB0cnl7XHJcbiAgICAgICAgZHJvcFRhcmdldC5pbnNlcnRCZWZvcmUoaXRlbSwgcmVmZXJlbmNlKTtcclxuICAgICAgICBpZiAoZHJha2UuYW5pbWF0ZSAmJiBtb3ZlciAmJiBtb3ZlclJlY3QpIHtcclxuICAgICAgICAgIGFuaW1hdGUobW92ZXJSZWN0LCBtb3Zlcik7XHJcbiAgICAgICAgICBhbmltYXRlKGl0ZW1SZWN0LCBpdGVtKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZHJha2UuZW1pdCgnc2hhZG93JywgaXRlbSwgZHJvcFRhcmdldCwgX3NvdXJjZSk7XHJcbiAgICAgIH1jYXRjaChlcnIpe31cclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIG1vdmVkICh0eXBlKSB7IGRyYWtlLmVtaXQodHlwZSwgaXRlbSwgX2xhc3REcm9wVGFyZ2V0LCBfc291cmNlKTsgfVxyXG4gICAgZnVuY3Rpb24gb3ZlciAoKSB7IGlmIChjaGFuZ2VkKSB7IG1vdmVkKCdvdmVyJyk7IH0gfVxyXG4gICAgZnVuY3Rpb24gb3V0ICgpIHsgaWYgKF9sYXN0RHJvcFRhcmdldCkgeyBtb3ZlZCgnb3V0Jyk7IH0gfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3BpbGxPdmVyIChlbCkge1xyXG4gICAgY2xhc3Nlcy5ybShlbCwgJ2d1LWhpZGUnKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNwaWxsT3V0IChlbCkge1xyXG4gICAgaWYgKGRyYWtlLmRyYWdnaW5nKSB7IGNsYXNzZXMuYWRkKGVsLCAnZ3UtaGlkZScpOyB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZW5kZXJNaXJyb3JJbWFnZSAoKSB7XHJcbiAgICBpZiAoX21pcnJvcikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICB2YXIgcmVjdCA9IF9pdGVtLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgX21pcnJvciA9IF9pdGVtLmNsb25lTm9kZSh0cnVlKTtcclxuICAgIF9taXJyb3Iuc3R5bGUud2lkdGggPSBnZXRSZWN0V2lkdGgocmVjdCkgKyAncHgnO1xyXG4gICAgX21pcnJvci5zdHlsZS5oZWlnaHQgPSBnZXRSZWN0SGVpZ2h0KHJlY3QpICsgJ3B4JztcclxuICAgIGNsYXNzZXMucm0oX21pcnJvciwgJ2d1LXRyYW5zaXQnKTtcclxuICAgIGNsYXNzZXMuYWRkKF9taXJyb3IsICdndS1taXJyb3InKTtcclxuICAgIGlmICh0eXBlb2Ygby5taXJyb3JDb250YWluZXIgPT09ICdmdW5jdGlvbicpIHsgby5taXJyb3JDb250YWluZXIgPSBvLm1pcnJvckNvbnRhaW5lcigpOyB9XHJcbiAgICBvLm1pcnJvckNvbnRhaW5lci5hcHBlbmRDaGlsZChfbWlycm9yKTtcclxuICAgIGlmICh0eXBlb2Ygby5zY3JvbGxDb250YWluZXIgPT09ICdmdW5jdGlvbicpIHsgby5zY3JvbGxDb250YWluZXIgPSBvLnNjcm9sbENvbnRhaW5lcigpOyB9XHJcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCAnYWRkJywgJ21vdXNlbW92ZScsIGRyYWcpO1xyXG4gICAgY2xhc3Nlcy5hZGQoby5taXJyb3JDb250YWluZXIsICdndS11bnNlbGVjdGFibGUnKTtcclxuICAgIGRyYWtlLmVtaXQoJ2Nsb25lZCcsIF9taXJyb3IsIF9pdGVtLCAnbWlycm9yJyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZW1vdmVNaXJyb3JJbWFnZSAoKSB7XHJcbiAgICBpZiAoX21pcnJvcikge1xyXG4gICAgICBjbGFzc2VzLnJtKG8ubWlycm9yQ29udGFpbmVyLCAnZ3UtdW5zZWxlY3RhYmxlJyk7XHJcbiAgICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsICdyZW1vdmUnLCAnbW91c2Vtb3ZlJywgZHJhZyk7XHJcbiAgICAgIGdldFBhcmVudChfbWlycm9yKS5yZW1vdmVDaGlsZChfbWlycm9yKTtcclxuICAgICAgX21pcnJvciA9IG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBnZXRJbW1lZGlhdGVDaGlsZCAoZHJvcFRhcmdldCwgdGFyZ2V0KSB7XHJcbiAgICB2YXIgaW1tZWRpYXRlID0gdGFyZ2V0O1xyXG4gICAgd2hpbGUgKGltbWVkaWF0ZSAhPT0gZHJvcFRhcmdldCAmJiBnZXRQYXJlbnQoaW1tZWRpYXRlKSAhPT0gZHJvcFRhcmdldCkge1xyXG4gICAgICBpbW1lZGlhdGUgPSBnZXRQYXJlbnQoaW1tZWRpYXRlKTtcclxuICAgIH1cclxuICAgIGlmIChpbW1lZGlhdGUgPT09IGRvY3VtZW50RWxlbWVudCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiBpbW1lZGlhdGU7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBnZXRSZWZlcmVuY2UgKGRyb3BUYXJnZXQsIHRhcmdldCwgeCwgeSkge1xyXG4gICAgdmFyIGhvcml6b250YWwgPSBvLmRpcmVjdGlvbiA9PT0gJ2hvcml6b250YWwnO1xyXG4gICAgdmFyIHJlZmVyZW5jZSA9IHRhcmdldCAhPT0gZHJvcFRhcmdldCA/IGluc2lkZSgpIDogb3V0c2lkZSgpO1xyXG4gICAgcmV0dXJuIHJlZmVyZW5jZTtcclxuXHJcbiAgICBmdW5jdGlvbiBvdXRzaWRlICgpIHsgLy8gc2xvd2VyLCBidXQgYWJsZSB0byBmaWd1cmUgb3V0IGFueSBwb3NpdGlvblxyXG4gICAgICB2YXIgbGVuID0gZHJvcFRhcmdldC5jaGlsZHJlbi5sZW5ndGg7XHJcbiAgICAgIHZhciBpO1xyXG4gICAgICB2YXIgZWw7XHJcbiAgICAgIHZhciByZWN0O1xyXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgICBlbCA9IGRyb3BUYXJnZXQuY2hpbGRyZW5baV07XHJcbiAgICAgICAgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGlmIChob3Jpem9udGFsICYmIChyZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMikgPiB4KSB7IHJldHVybiBlbDsgfVxyXG4gICAgICAgIGlmICghaG9yaXpvbnRhbCAmJiAocmVjdC50b3AgKyByZWN0LmhlaWdodCAvIDIpID4geSkgeyByZXR1cm4gZWw7IH1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBpbnNpZGUgKCkgeyAvLyBmYXN0ZXIsIGJ1dCBvbmx5IGF2YWlsYWJsZSBpZiBkcm9wcGVkIGluc2lkZSBhIGNoaWxkIGVsZW1lbnRcclxuICAgICAgdmFyIHJlY3QgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIGlmIChob3Jpem9udGFsKSB7XHJcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoeCA+IHJlY3QubGVmdCArIGdldFJlY3RXaWR0aChyZWN0KSAvIDIpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiByZXNvbHZlKHkgPiByZWN0LnRvcCArIGdldFJlY3RIZWlnaHQocmVjdCkgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZXNvbHZlIChhZnRlcikge1xyXG4gICAgICByZXR1cm4gYWZ0ZXIgPyBuZXh0RWwodGFyZ2V0KSA6IHRhcmdldDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGlzQ29weSAoaXRlbSwgY29udGFpbmVyKSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIG8uY29weSA9PT0gJ2Jvb2xlYW4nID8gby5jb3B5IDogby5jb3B5KGl0ZW0sIGNvbnRhaW5lcik7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB0b3VjaHkgKGVsLCBvcCwgdHlwZSwgZm4pIHtcclxuICB2YXIgdG91Y2ggPSB7XHJcbiAgICBtb3VzZXVwOiAndG91Y2hlbmQnLFxyXG4gICAgbW91c2Vkb3duOiAndG91Y2hzdGFydCcsXHJcbiAgICBtb3VzZW1vdmU6ICd0b3VjaG1vdmUnXHJcbiAgfTtcclxuICB2YXIgcG9pbnRlcnMgPSB7XHJcbiAgICBtb3VzZXVwOiAncG9pbnRlcnVwJyxcclxuICAgIG1vdXNlZG93bjogJ3BvaW50ZXJkb3duJyxcclxuICAgIG1vdXNlbW92ZTogJ3BvaW50ZXJtb3ZlJ1xyXG4gIH07XHJcbiAgdmFyIG1pY3Jvc29mdCA9IHtcclxuICAgIG1vdXNldXA6ICdNU1BvaW50ZXJVcCcsXHJcbiAgICBtb3VzZWRvd246ICdNU1BvaW50ZXJEb3duJyxcclxuICAgIG1vdXNlbW92ZTogJ01TUG9pbnRlck1vdmUnXHJcbiAgfTtcclxuICBpZiAoZ2xvYmFsLm5hdmlnYXRvci5wb2ludGVyRW5hYmxlZCkge1xyXG4gICAgY3Jvc3N2ZW50W29wXShlbCwgcG9pbnRlcnNbdHlwZV0sIGZuKTtcclxuICB9IGVsc2UgaWYgKGdsb2JhbC5uYXZpZ2F0b3IubXNQb2ludGVyRW5hYmxlZCkge1xyXG4gICAgY3Jvc3N2ZW50W29wXShlbCwgbWljcm9zb2Z0W3R5cGVdLCBmbik7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNyb3NzdmVudFtvcF0oZWwsIHRvdWNoW3R5cGVdLCBmbik7XHJcbiAgICBjcm9zc3ZlbnRbb3BdKGVsLCB0eXBlLCBmbik7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB3aGljaE1vdXNlQnV0dG9uIChlKSB7XHJcbiAgaWYgKGUudG91Y2hlcyAhPT0gdm9pZCAwKSB7IHJldHVybiBlLnRvdWNoZXMubGVuZ3RoOyB9XHJcbiAgaWYgKGUud2hpY2ggIT09IHZvaWQgMCAmJiBlLndoaWNoICE9PSAwKSB7IHJldHVybiBlLndoaWNoOyB9IC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvZHJhZ3VsYS9pc3N1ZXMvMjYxXHJcbiAgaWYgKGUuYnV0dG9ucyAhPT0gdm9pZCAwKSB7IHJldHVybiBlLmJ1dHRvbnM7IH1cclxuICB2YXIgYnV0dG9uID0gZS5idXR0b247XHJcbiAgaWYgKGJ1dHRvbiAhPT0gdm9pZCAwKSB7IC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vanF1ZXJ5L2pxdWVyeS9ibG9iLzk5ZThmZjFiYWE3YWUzNDFlOTRiYjg5YzNlODQ1NzBjN2MzYWQ5ZWEvc3JjL2V2ZW50LmpzI0w1NzMtTDU3NVxyXG4gICAgcmV0dXJuIGJ1dHRvbiAmIDEgPyAxIDogYnV0dG9uICYgMiA/IDMgOiAoYnV0dG9uICYgNCA/IDIgOiAwKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldE9mZnNldCAoZWwpIHtcclxuICB2YXIgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gIHJldHVybiB7XHJcbiAgICBsZWZ0OiByZWN0LmxlZnQgKyBnZXRTY3JvbGwoJ3Njcm9sbExlZnQnLCAncGFnZVhPZmZzZXQnKSxcclxuICAgIHRvcDogcmVjdC50b3AgKyBnZXRTY3JvbGwoJ3Njcm9sbFRvcCcsICdwYWdlWU9mZnNldCcpXHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0U2Nyb2xsIChzY3JvbGxQcm9wLCBvZmZzZXRQcm9wKSB7XHJcbiAgaWYgKHR5cGVvZiBnbG9iYWxbb2Zmc2V0UHJvcF0gIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICByZXR1cm4gZ2xvYmFsW29mZnNldFByb3BdO1xyXG4gIH1cclxuICBpZiAoZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkge1xyXG4gICAgcmV0dXJuIGRvY3VtZW50RWxlbWVudFtzY3JvbGxQcm9wXTtcclxuICB9XHJcbiAgcmV0dXJuIGRvYy5ib2R5W3Njcm9sbFByb3BdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRFbGVtZW50QmVoaW5kUG9pbnQgKHBvaW50LCB4LCB5KSB7XHJcbiAgdmFyIHAgPSBwb2ludCB8fCB7fTtcclxuICB2YXIgc3RhdGUgPSBwLmNsYXNzTmFtZTtcclxuICB2YXIgZWw7XHJcbiAgcC5jbGFzc05hbWUgKz0gJyBndS1oaWRlJztcclxuICBlbCA9IGRvYy5lbGVtZW50RnJvbVBvaW50KHgsIHkpO1xyXG4gIHAuY2xhc3NOYW1lID0gc3RhdGU7XHJcbiAgcmV0dXJuIGVsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBuZXZlciAoKSB7IHJldHVybiBmYWxzZTsgfVxyXG5mdW5jdGlvbiBhbHdheXMgKCkgeyByZXR1cm4gdHJ1ZTsgfVxyXG5mdW5jdGlvbiBnZXRSZWN0V2lkdGggKHJlY3QpIHsgcmV0dXJuIHJlY3Qud2lkdGggfHwgKHJlY3QucmlnaHQgLSByZWN0LmxlZnQpOyB9XHJcbmZ1bmN0aW9uIGdldFJlY3RIZWlnaHQgKHJlY3QpIHsgcmV0dXJuIHJlY3QuaGVpZ2h0IHx8IChyZWN0LmJvdHRvbSAtIHJlY3QudG9wKTsgfVxyXG5mdW5jdGlvbiBnZXRQYXJlbnQgKGVsKSB7IHJldHVybiBlbC5wYXJlbnROb2RlID09PSBkb2MgPyBudWxsIDogZWwucGFyZW50Tm9kZTsgfVxyXG5mdW5jdGlvbiBpc0lucHV0IChlbCkgeyByZXR1cm4gZWwudGFnTmFtZSA9PT0gJ0lOUFVUJyB8fCBlbC50YWdOYW1lID09PSAnVEVYVEFSRUEnIHx8IGVsLnRhZ05hbWUgPT09ICdTRUxFQ1QnIHx8IGlzRWRpdGFibGUoZWwpOyB9XHJcbmZ1bmN0aW9uIGlzRWRpdGFibGUgKGVsKSB7XHJcbiAgaWYgKCFlbCkgeyByZXR1cm4gZmFsc2U7IH0gLy8gbm8gcGFyZW50cyB3ZXJlIGVkaXRhYmxlXHJcbiAgaWYgKGVsLmNvbnRlbnRFZGl0YWJsZSA9PT0gJ2ZhbHNlJykgeyByZXR1cm4gZmFsc2U7IH0gLy8gc3RvcCB0aGUgbG9va3VwXHJcbiAgaWYgKGVsLmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7IHJldHVybiB0cnVlOyB9IC8vIGZvdW5kIGEgY29udGVudEVkaXRhYmxlIGVsZW1lbnQgaW4gdGhlIGNoYWluXHJcbiAgcmV0dXJuIGlzRWRpdGFibGUoZ2V0UGFyZW50KGVsKSk7IC8vIGNvbnRlbnRFZGl0YWJsZSBpcyBzZXQgdG8gJ2luaGVyaXQnXHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5leHRFbCAoZWwpIHtcclxuICByZXR1cm4gZWwubmV4dEVsZW1lbnRTaWJsaW5nIHx8IG1hbnVhbGx5KCk7XHJcbiAgZnVuY3Rpb24gbWFudWFsbHkgKCkge1xyXG4gICAgdmFyIHNpYmxpbmcgPSBlbDtcclxuICAgIGRvIHtcclxuICAgICAgc2libGluZyA9IHNpYmxpbmcubmV4dFNpYmxpbmc7XHJcbiAgICB9IHdoaWxlIChzaWJsaW5nICYmIHNpYmxpbmcubm9kZVR5cGUgIT09IDEpO1xyXG4gICAgcmV0dXJuIHNpYmxpbmc7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXRlIGFuIGFuaW1hdGlvbiBmcm9tIHBvc2l0aW9uIGJlZm9yZSBzb3J0aW5nIHRvIHByZXNlbnQgcG9zaXRpb25cclxuICogQHBhcmFtIHByZXZSZWN0IGluY2x1ZGluZyBlbGVtZW50J3MgcG9zaXRpb24gaW5mb21hdGlvbiBiZWZvcmUgc29ydGluZ1xyXG4gKiBAcGFyYW0gdGFyZ2V0IGVsZW1lbnQgYWZ0ZXIgc29ydGluZ1xyXG4gKi9cclxuZnVuY3Rpb24gYW5pbWF0ZSAocHJldlJlY3QsIHRhcmdldCkge1xyXG4gIGlmICghcHJldlJlY3QgfHwgIXRhcmdldCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICB2YXIgY3VycmVudFJlY3QgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgdmFyIG9yaWdpblByb3BzID0ge3RyYW5zaXRpb246IHRhcmdldC5zdHlsZS50cmFuc2l0aW9uLCB0cmFuc2Zvcm06IHRhcmdldC5zdHlsZS50cmFuc2Zvcm19O1xyXG4gIE9iamVjdC5hc3NpZ24odGFyZ2V0LnN0eWxlLCB7XHJcbiAgICB0cmFuc2l0aW9uOiAnbm9uZScsXHJcbiAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoJyArIChwcmV2UmVjdC5sZWZ0IC0gY3VycmVudFJlY3QubGVmdCkgKyAncHgsJyArIChwcmV2UmVjdC50b3AgLSBjdXJyZW50UmVjdC50b3ApICsgJ3B4KSdcclxuICB9KTtcclxuICB0YXJnZXQub2Zmc2V0V2lkdGg7IC8vIHJlcGFpbnRcclxuICBPYmplY3QuYXNzaWduKHRhcmdldC5zdHlsZSwge3RyYW5zaXRpb246ICdhbGwgJyArIGFuaW1hdGVEdXJhdGlvbiArICdtcycsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgwLDApJ30pO1xyXG4gIGNsZWFyVGltZW91dCh0YXJnZXQuYW5pbWF0ZWQpO1xyXG4gIHRhcmdldC5hbmltYXRlZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xyXG4gICAgT2JqZWN0LmFzc2lnbih0YXJnZXQuc3R5bGUsIHtvcmlnaW5Qcm9wczogb3JpZ2luUHJvcHN9KTtcclxuICAgIHRhcmdldC5hbmltYXRlZCA9IGZhbHNlO1xyXG4gIH0sIGFuaW1hdGVEdXJhdGlvbik7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRFdmVudEhvc3QgKGUpIHtcclxuICAvLyBvbiB0b3VjaGVuZCBldmVudCwgd2UgaGF2ZSB0byB1c2UgYGUuY2hhbmdlZFRvdWNoZXNgXHJcbiAgLy8gc2VlIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvNzE5MjU2My90b3VjaGVuZC1ldmVudC1wcm9wZXJ0aWVzXHJcbiAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8zNFxyXG4gIGlmIChlLnRhcmdldFRvdWNoZXMgJiYgZS50YXJnZXRUb3VjaGVzLmxlbmd0aCkge1xyXG4gICAgcmV0dXJuIGUudGFyZ2V0VG91Y2hlc1swXTtcclxuICB9XHJcbiAgaWYgKGUuY2hhbmdlZFRvdWNoZXMgJiYgZS5jaGFuZ2VkVG91Y2hlcy5sZW5ndGgpIHtcclxuICAgIHJldHVybiBlLmNoYW5nZWRUb3VjaGVzWzBdO1xyXG4gIH1cclxuICByZXR1cm4gZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Q29vcmQgKGNvb3JkLCBlKSB7XHJcbiAgdmFyIGhvc3QgPSBnZXRFdmVudEhvc3QoZSk7XHJcbiAgdmFyIG1pc3NNYXAgPSB7XHJcbiAgICBwYWdlWDogJ2NsaWVudFgnLCAvLyBJRThcclxuICAgIHBhZ2VZOiAnY2xpZW50WScgLy8gSUU4XHJcbiAgfTtcclxuICBpZiAoY29vcmQgaW4gbWlzc01hcCAmJiAhKGNvb3JkIGluIGhvc3QpICYmIG1pc3NNYXBbY29vcmRdIGluIGhvc3QpIHtcclxuICAgIGNvb3JkID0gbWlzc01hcFtjb29yZF07XHJcbiAgfVxyXG4gIHJldHVybiBob3N0W2Nvb3JkXTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBkcmFndWxhO1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0aWNreSA9IHJlcXVpcmUoJ3RpY2t5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHtcbiAgaWYgKCFmbikgeyByZXR1cm47IH1cbiAgdGlja3koZnVuY3Rpb24gcnVuICgpIHtcbiAgICBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7XG4gIH0pO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgZGVib3VuY2UgPSByZXF1aXJlKCcuL2RlYm91bmNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgZXZ0ID0ge307XG4gIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICBpZiAoIWV2dFt0eXBlXSkge1xuICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXZ0W3R5cGVdLnB1c2goZm4pO1xuICAgIH1cbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgdGhpbmcub24odHlwZSwgZm4pO1xuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcub2ZmID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGlmIChjID09PSAxKSB7XG4gICAgICBkZWxldGUgZXZ0W3R5cGVdO1xuICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgZXZ0ID0ge307XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldC5zcGxpY2UoZXQuaW5kZXhPZihmbiksIDEpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdChhcmdzLnNoaWZ0KCkpLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9O1xuICB0aGluZy5lbWl0dGVyU25hcHNob3QgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgIHZhciBldCA9IChldnRbdHlwZV0gfHwgW10pLnNsaWNlKDApO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciBjdHggPSB0aGlzIHx8IHRoaW5nO1xuICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldC5sZW5ndGgpIHsgdGhyb3cgYXJncy5sZW5ndGggPT09IDEgPyBhcmdzWzBdIDogYXJnczsgfVxuICAgICAgZXQuZm9yRWFjaChmdW5jdGlvbiBlbWl0dGVyIChsaXN0ZW4pIHtcbiAgICAgICAgaWYgKG9wdHMuYXN5bmMpIHsgZGVib3VuY2UobGlzdGVuLCBhcmdzLCBjdHgpOyB9IGVsc2UgeyBsaXN0ZW4uYXBwbHkoY3R4LCBhcmdzKTsgfVxuICAgICAgICBpZiAobGlzdGVuLl9vbmNlKSB7IHRoaW5nLm9mZih0eXBlLCBsaXN0ZW4pOyB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICB9O1xuICByZXR1cm4gdGhpbmc7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY3VzdG9tRXZlbnQgPSByZXF1aXJlKCdjdXN0b20tZXZlbnQnKTtcbnZhciBldmVudG1hcCA9IHJlcXVpcmUoJy4vZXZlbnRtYXAnKTtcbnZhciBkb2MgPSBnbG9iYWwuZG9jdW1lbnQ7XG52YXIgYWRkRXZlbnQgPSBhZGRFdmVudEVhc3k7XG52YXIgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEVhc3k7XG52YXIgaGFyZENhY2hlID0gW107XG5cbmlmICghZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgYWRkRXZlbnQgPSBhZGRFdmVudEhhcmQ7XG4gIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRIYXJkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRFdmVudCxcbiAgcmVtb3ZlOiByZW1vdmVFdmVudCxcbiAgZmFicmljYXRlOiBmYWJyaWNhdGVFdmVudFxufTtcblxuZnVuY3Rpb24gYWRkRXZlbnRFYXN5IChlbCwgdHlwZSwgZm4sIGNhcHR1cmluZykge1xuICByZXR1cm4gZWwuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBmbiwgY2FwdHVyaW5nKTtcbn1cblxuZnVuY3Rpb24gYWRkRXZlbnRIYXJkIChlbCwgdHlwZSwgZm4pIHtcbiAgcmV0dXJuIGVsLmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwKGVsLCB0eXBlLCBmbikpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEVhc3kgKGVsLCB0eXBlLCBmbiwgY2FwdHVyaW5nKSB7XG4gIHJldHVybiBlbC5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGZuLCBjYXB0dXJpbmcpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEhhcmQgKGVsLCB0eXBlLCBmbikge1xuICB2YXIgbGlzdGVuZXIgPSB1bndyYXAoZWwsIHR5cGUsIGZuKTtcbiAgaWYgKGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIGVsLmRldGFjaEV2ZW50KCdvbicgKyB0eXBlLCBsaXN0ZW5lcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmFicmljYXRlRXZlbnQgKGVsLCB0eXBlLCBtb2RlbCkge1xuICB2YXIgZSA9IGV2ZW50bWFwLmluZGV4T2YodHlwZSkgPT09IC0xID8gbWFrZUN1c3RvbUV2ZW50KCkgOiBtYWtlQ2xhc3NpY0V2ZW50KCk7XG4gIGlmIChlbC5kaXNwYXRjaEV2ZW50KSB7XG4gICAgZWwuZGlzcGF0Y2hFdmVudChlKTtcbiAgfSBlbHNlIHtcbiAgICBlbC5maXJlRXZlbnQoJ29uJyArIHR5cGUsIGUpO1xuICB9XG4gIGZ1bmN0aW9uIG1ha2VDbGFzc2ljRXZlbnQgKCkge1xuICAgIHZhciBlO1xuICAgIGlmIChkb2MuY3JlYXRlRXZlbnQpIHtcbiAgICAgIGUgPSBkb2MuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XG4gICAgICBlLmluaXRFdmVudCh0eXBlLCB0cnVlLCB0cnVlKTtcbiAgICB9IGVsc2UgaWYgKGRvYy5jcmVhdGVFdmVudE9iamVjdCkge1xuICAgICAgZSA9IGRvYy5jcmVhdGVFdmVudE9iamVjdCgpO1xuICAgIH1cbiAgICByZXR1cm4gZTtcbiAgfVxuICBmdW5jdGlvbiBtYWtlQ3VzdG9tRXZlbnQgKCkge1xuICAgIHJldHVybiBuZXcgY3VzdG9tRXZlbnQodHlwZSwgeyBkZXRhaWw6IG1vZGVsIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbCwgdHlwZSwgZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIgKG9yaWdpbmFsRXZlbnQpIHtcbiAgICB2YXIgZSA9IG9yaWdpbmFsRXZlbnQgfHwgZ2xvYmFsLmV2ZW50O1xuICAgIGUudGFyZ2V0ID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIGUucHJldmVudERlZmF1bHQgPSBlLnByZXZlbnREZWZhdWx0IHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGUud2hpY2ggPSBlLndoaWNoIHx8IGUua2V5Q29kZTtcbiAgICBmbi5jYWxsKGVsLCBlKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gd3JhcCAoZWwsIHR5cGUsIGZuKSB7XG4gIHZhciB3cmFwcGVyID0gdW53cmFwKGVsLCB0eXBlLCBmbikgfHwgd3JhcHBlckZhY3RvcnkoZWwsIHR5cGUsIGZuKTtcbiAgaGFyZENhY2hlLnB1c2goe1xuICAgIHdyYXBwZXI6IHdyYXBwZXIsXG4gICAgZWxlbWVudDogZWwsXG4gICAgdHlwZTogdHlwZSxcbiAgICBmbjogZm5cbiAgfSk7XG4gIHJldHVybiB3cmFwcGVyO1xufVxuXG5mdW5jdGlvbiB1bndyYXAgKGVsLCB0eXBlLCBmbikge1xuICB2YXIgaSA9IGZpbmQoZWwsIHR5cGUsIGZuKTtcbiAgaWYgKGkpIHtcbiAgICB2YXIgd3JhcHBlciA9IGhhcmRDYWNoZVtpXS53cmFwcGVyO1xuICAgIGhhcmRDYWNoZS5zcGxpY2UoaSwgMSk7IC8vIGZyZWUgdXAgYSB0YWQgb2YgbWVtb3J5XG4gICAgcmV0dXJuIHdyYXBwZXI7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmluZCAoZWwsIHR5cGUsIGZuKSB7XG4gIHZhciBpLCBpdGVtO1xuICBmb3IgKGkgPSAwOyBpIDwgaGFyZENhY2hlLmxlbmd0aDsgaSsrKSB7XG4gICAgaXRlbSA9IGhhcmRDYWNoZVtpXTtcbiAgICBpZiAoaXRlbS5lbGVtZW50ID09PSBlbCAmJiBpdGVtLnR5cGUgPT09IHR5cGUgJiYgaXRlbS5mbiA9PT0gZm4pIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXZlbnRtYXAgPSBbXTtcbnZhciBldmVudG5hbWUgPSAnJztcbnZhciByb24gPSAvXm9uLztcblxuZm9yIChldmVudG5hbWUgaW4gZ2xvYmFsKSB7XG4gIGlmIChyb24udGVzdChldmVudG5hbWUpKSB7XG4gICAgZXZlbnRtYXAucHVzaChldmVudG5hbWUuc2xpY2UoMikpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXZlbnRtYXA7XG4iLCJcbnZhciBOYXRpdmVDdXN0b21FdmVudCA9IGdsb2JhbC5DdXN0b21FdmVudDtcblxuZnVuY3Rpb24gdXNlTmF0aXZlICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgcCA9IG5ldyBOYXRpdmVDdXN0b21FdmVudCgnY2F0JywgeyBkZXRhaWw6IHsgZm9vOiAnYmFyJyB9IH0pO1xuICAgIHJldHVybiAgJ2NhdCcgPT09IHAudHlwZSAmJiAnYmFyJyA9PT0gcC5kZXRhaWwuZm9vO1xuICB9IGNhdGNoIChlKSB7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENyb3NzLWJyb3dzZXIgYEN1c3RvbUV2ZW50YCBjb25zdHJ1Y3Rvci5cbiAqXG4gKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvQ3VzdG9tRXZlbnQuQ3VzdG9tRXZlbnRcbiAqXG4gKiBAcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSB1c2VOYXRpdmUoKSA/IE5hdGl2ZUN1c3RvbUV2ZW50IDpcblxuLy8gSUUgPj0gOVxuJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGRvY3VtZW50LmNyZWF0ZUV2ZW50ID8gZnVuY3Rpb24gQ3VzdG9tRXZlbnQgKHR5cGUsIHBhcmFtcykge1xuICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdDdXN0b21FdmVudCcpO1xuICBpZiAocGFyYW1zKSB7XG4gICAgZS5pbml0Q3VzdG9tRXZlbnQodHlwZSwgcGFyYW1zLmJ1YmJsZXMsIHBhcmFtcy5jYW5jZWxhYmxlLCBwYXJhbXMuZGV0YWlsKTtcbiAgfSBlbHNlIHtcbiAgICBlLmluaXRDdXN0b21FdmVudCh0eXBlLCBmYWxzZSwgZmFsc2UsIHZvaWQgMCk7XG4gIH1cbiAgcmV0dXJuIGU7XG59IDpcblxuLy8gSUUgPD0gOFxuZnVuY3Rpb24gQ3VzdG9tRXZlbnQgKHR5cGUsIHBhcmFtcykge1xuICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50T2JqZWN0KCk7XG4gIGUudHlwZSA9IHR5cGU7XG4gIGlmIChwYXJhbXMpIHtcbiAgICBlLmJ1YmJsZXMgPSBCb29sZWFuKHBhcmFtcy5idWJibGVzKTtcbiAgICBlLmNhbmNlbGFibGUgPSBCb29sZWFuKHBhcmFtcy5jYW5jZWxhYmxlKTtcbiAgICBlLmRldGFpbCA9IHBhcmFtcy5kZXRhaWw7XG4gIH0gZWxzZSB7XG4gICAgZS5idWJibGVzID0gZmFsc2U7XG4gICAgZS5jYW5jZWxhYmxlID0gZmFsc2U7XG4gICAgZS5kZXRhaWwgPSB2b2lkIDA7XG4gIH1cbiAgcmV0dXJuIGU7XG59XG4iLCJ2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuaWYgKHNpKSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbn0gZWxzZSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdGljazsiXX0=
