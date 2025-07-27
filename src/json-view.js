/*
MIT License

Copyright (c) 2020 Pavel Grabovets

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Original repo: https://github.com/pgrabovets/json-view

Extended in April 2025 by Carsten Emde to handle "$ref" references for the OSSelot
project (www.osselot.org) by Open Source Automation Development Lab (OSADL) eG.

1. Start all nodes collapsed.
2. Render a node only when expanded by user interaction.
3. When a node is expanded that is referenced by "$ref", resolve it for the current
   node and expand it then.
*/

import getDataType from './utils/getDataType.js';
import { listen, detach, element } from './utils/dom.js';

const classes = {
    HIDDEN: 'hidden',
    CARET_ICON: 'caret-icon',
    CARET_RIGHT: 'fa-caret-right',
    CARET_DOWN: 'fa-caret-down',
    ICON: 'fas'
}

function expandedTemplate(params = {}) {
  const { key, size } = params;
  return `
    <div class="line">
      <div class="caret-icon"><i class="fas fa-caret-right"></i></div>
      <div class="json-key">${key}</div>
      <div class="json-size">${size}</div>
    </div>
  `
}

function notExpandedTemplate(params = {}) {
  const { key, value, type } = params;
  return `
    <div class="line">
      <div class="empty-icon"></div>
      <div class="json-key">${key}</div>
      <div class="json-separator">:</div>
      <div class="json-value json-${type}">${value}</div>
    </div>
  `
}

function createContainerElement() {
  const el = element('div');
  el.className = 'json-container';
  return el;
}

function hideNodeChildren(node) {
  node.children.forEach((child) => {
    child.el.classList.add(classes.HIDDEN);
    if (child.isExpanded) {
      hideNodeChildren(child);
    }
  });
}

function showNodeChildren(node) {
  node.children.forEach((child) => {
    child.el.classList.remove(classes.HIDDEN);
    if (child.isExpanded) {
      showNodeChildren(child);
    }
  });
}

function setCaretIconDown(node) {
  if (node.children.length > 0) {
    const icon = node.el.querySelector('.' + classes.ICON);
    if (icon) {
      icon.classList.replace(classes.CARET_RIGHT, classes.CARET_DOWN);
    }
  }
}

function setCaretIconRight(node) {
  if (node.children.length > 0) {
    const icon = node.el.querySelector('.' + classes.ICON);
    if (icon) {
      icon.classList.replace(classes.CARET_DOWN, classes.CARET_RIGHT);
    }
  }
}

export function toggleNode(caretEl, node) {
  var oldCaretCursor = caretEl.style.cursor;
  caretEl.style.cursor = "wait";
  if (node.isExpanded) {
    node.isExpanded = false;
    setCaretIconRight(node);
    setTimeout(function() {
      hideNodeChildren(node);
      caretEl.style.cursor = oldCaretCursor;
    }, 10);
  } else {
    node.isExpanded = true;
    setCaretIconDown(node);
    setTimeout(function() {
      if (typeof node.children !== 'undefined' && node.children[0].isPending) {
        const containerEl = createContainerElement();
        if (node.children[0].key == "$ref") {
          node = extendNodeElementByRef(node, caretEl.parentElement);
        }
        traverse(node, function(node) {
          node.el = createNodeElement(node);
          if (node.key != "$ref")
            containerEl.appendChild(node.el);
          node.isPending = false;
        });
        caretEl.parentElement.replaceWith(containerEl);
        expand(node);
      }
      showNodeChildren(node);
      caretEl.style.cursor = oldCaretCursor;
    }, 10);
  }
}

/**
 * Resolve reference
 * @param {object} node
 * @return dereferenced JSON node
 */
function resolveref(node) {
  var parts = node.children[0].value.replace(/\//g, "|").replace(/~1/g, "/").split("|")
  return node.parsedData[parts[1]][parts[2]];
}

/**
 * Create node html element by reference
 * @param {object} node
 * @param {target} parent html element
 * @return html element
 */
function extendNodeElementByRef(node, target) {
  var parsedData = resolveref(node);
  createSubnode(parsedData, node, false);
  node.children.splice(0, 1);
  return node;
}

/**
 * Create node html element
 * @param {object} node
 * @return html element
 */
function createNodeElement(node) {
  let el = element('div');
  let isRef = false;

  const getSizeString = (node) => {
    const len = node.children.length;
    if (node.type === 'array') return `[${len}]`;
    if (node.type === 'object') return `{${len}}`;
    return null;
  }

  if (node.children.length > 0) {
    el.innerHTML = expandedTemplate({
      key: node.key,
      size: getSizeString(node),
    })
    const caretEl = el.querySelector('.' + classes.CARET_ICON);
    node.dispose = listen(caretEl, 'click', () => toggleNode(caretEl, node));
  } else {
    el.innerHTML = notExpandedTemplate({
      key: node.key,
      value: node.value === "" ? '""' : node.value,
      type: node.value === '{}' ? 'object' : typeof node.value
    })
  }

  const lineEl = el.children[0];

  if (node.parent !== null) {
    lineEl.classList.add(classes.HIDDEN);
  }

  lineEl.style = 'margin-left: ' + node.depth * 18 + 'px;';

  return lineEl;
}

/**
 * Recursively traverse Tree object
 * @param {Object} node
 * @param {Callback} callback
 */
export function traverse(node, callback) {
  callback(node);
  if (node.children.length > 0) {
    node.children.forEach((child) => {
      traverse(child, callback);
    });
  }
}

/**
 * Create node object
 * @param {object} opt options
 * @return {object}
 */
function createNode(opt = {}) {
  const isEmptyObject = (value) => {
    return (
      getDataType(value) === 'object' &&
      Object.keys(value).length === 0
    )
  }

  let value = opt.hasOwnProperty('value') ? opt.value : null;

  if (isEmptyObject(value)) {
    value = "{}";
  }

  return {
    key: opt.key || null,
    parent: opt.parent || null,
    value: value,
    isExpanded: opt.isExpanded || false,
    type: opt.type || null,
    children: opt.children || [],
    el: opt.el || null,
    depth: opt.depth || 0,
    dispose: null,
    isPending: opt.isPending,
    parsedData: opt.parsedData
  }
}

/**
 * Create subnode for node
 * @param {object} Json data
 * @param {object} node
 */
function createSubnode(data, node, late) {
  if (typeof data === 'object') {
    var pending;
    if (node.depth > 1 && !late)
        pending = true;
    else
        pending = false;
    for (let key in data) {
      const child = createNode({
        value: data[key],
        key: key,
        depth: node.depth + 1,
        type: getDataType(data[key]),
        parent: node,
        isPending: pending,
        parsedData: node.parsedData
      });
      node.children.push(child);
      createSubnode(data[key], child, late);
    }
  }
}

function getJsonObject(data) {
  return typeof data === 'string' ? JSON.parse(data) : data;
}

/**
 * Create tree
 * @param {object | string} jsonData 
 * @return {object}
 */
export function create(jsonData) {
  const parsedData = getJsonObject(jsonData);
  const rootNode = createNode({
    value: parsedData,
    key: getDataType(parsedData),
    type: getDataType(parsedData),
    isPending: false,
  });
  rootNode.parsedData = parsedData;
  createSubnode(parsedData, rootNode, false);
  return rootNode;
}

/**
 * Render JSON string into DOM container
 * @param {string | object} jsonData
 * @param {htmlElement} targetElement
 * @return {object} tree
 */
export function renderJSON(jsonData, targetElement) {
  const parsedData = getJsonObject(jsonData);
  const tree = create(parsedData);
  render(tree, targetElement);
  return tree;
}

/**
 * Count number of elements in an object
 * @param {object} obj
 * @return {int} number
 */
function countElements(obj) {
    var count = 0;
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop))
            ++count;
    }
    return count;
}

/**
 * Render tree into DOM container
 * @param {object} tree
 * @param {htmlElement} targetElement
 */
export function render(tree, targetElement) {
  const containerEl = createContainerElement();

  traverse(tree, function(node) {
    if (!node.isPending) {
      node.el = createNodeElement(node);
      containerEl.appendChild(node.el);
    } else {
      if (node.key == "$ref") {
        var parsedData = resolveref(node.parent);
        var child = node.parent.el.children[2];
        child.innerText = child.innerText.replace("1", countElements(parsedData));
      }
    }
  });

  targetElement.appendChild(containerEl);
}

export function expand(node) {
  traverse(node, function(child) {
    child.el.classList.remove(classes.HIDDEN);
    child.isExpanded = true;
    setCaretIconDown(child);
  });
}

export function collapse(node) {
  traverse(node, function(child) {
    child.isExpanded = false;
    if (child.depth > node.depth) child.el.classList.add(classes.HIDDEN);
    setCaretIconRight(child);
  });
}

export function destroy(tree) {
  traverse(tree, (node) => {
    if (node.dispose) {
      node.dispose(); 
    }
  })
  detach(tree.el.parentNode);
}

/**
 * Export public interface
 */
export default {
  toggleNode,
  render,
  create,
  renderJSON,
  expand,
  collapse,
  traverse,
  destroy
}
