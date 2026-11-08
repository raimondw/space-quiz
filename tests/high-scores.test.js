const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.classList = {
      add: (...names) => names.forEach((name) => this.classList.names.add(name)),
      remove: (...names) => names.forEach((name) => this.classList.names.delete(name)),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !this.classList.names.has(name) : force;
        if (shouldAdd) this.classList.names.add(name);
        else this.classList.names.delete(name);
        return shouldAdd;
      },
      names: new Set()
    };
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelectorAll(selector) {
    return selector === "button" ? this.children.filter((child) => child.type === "button") : [];
  }

  focus() {}
}

function renderSavedScores(savedScores) {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() {
      return new Element();
    }
  };
  const localStorage = {
    getItem: () => savedScores,
    setItem() {}
  };

  vm.runInNewContext(appScript, {
    document,
    window: { localStorage },
    performance: { now: () => 0 },
    setInterval: () => 1,
    clearInterval() {},
    console: { error() {} },
    Date,
    Intl
  });

  return elements.get("#high-score-list").children;
}

test("saved scores rank by score, response time, then recency and ignore invalid entries", () => {
  const savedScores = JSON.stringify([
    { score: 90, responseTime: 3, achievedAt: "2026-01-01T00:00:00.000Z" },
    { score: 90, responseTime: 3, achievedAt: "2026-02-01T00:00:00.000Z" },
    { score: 100, responseTime: 8, achievedAt: "2026-01-01T00:00:00.000Z" },
    { score: 90, achievedAt: "2026-03-01T00:00:00.000Z" },
    { score: 101, responseTime: 1, achievedAt: "2026-04-01T00:00:00.000Z" },
    { score: 80, responseTime: -1, achievedAt: "2026-04-01T00:00:00.000Z" },
    { score: 70, responseTime: 1, achievedAt: "not a date" }
  ]);

  const rows = renderSavedScores(savedScores);

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.children[1].textContent), ["100 / 100", "90 / 100", "90 / 100", "90 / 100"]);
  assert.deepEqual(rows.map((row) => row.children[2].textContent), ["8.0s", "3.0s", "3.0s", "—"]);
  assert.equal(rows[1].children[3].children[0].dateTime, "2026-02-01T00:00:00.000Z");
});

test("saved scores are limited to the ten highest-ranked entries", () => {
  const savedScores = JSON.stringify(Array.from({ length: 12 }, (_, responseTime) => ({
    score: 80,
    responseTime,
    achievedAt: new Date(Date.UTC(2026, 0, responseTime + 1)).toISOString()
  })));

  const rows = renderSavedScores(savedScores);

  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((row) => row.children[2].textContent), [
    "0.0s", "1.0s", "2.0s", "3.0s", "4.0s",
    "5.0s", "6.0s", "7.0s", "8.0s", "9.0s"
  ]);
});
