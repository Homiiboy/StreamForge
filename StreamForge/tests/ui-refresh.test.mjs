import assert from 'node:assert/strict';
import { RenderGate, isNamingEditor } from '../ui-refresh.js';

const gate = new RenderGate();
assert.equal(gate.requestRender(), true, 'idle renders immediately');
gate.beginEdit();
assert.equal(gate.requestRender(), false, 'render is deferred while editing');
assert.equal(gate.requestRender(), false, 'multiple refreshes stay deferred');
assert.equal(gate.endEdit(), true, 'one render is requested after editing ends');
assert.equal(gate.endEdit(), false, 'pending state is consumed once');

const fakeEditor = { matches: selector => selector.includes('.namingBox input') };
const fakeOther = { matches: () => false };
assert.equal(isNamingEditor(fakeEditor), true);
assert.equal(isNamingEditor(fakeOther), false);
assert.equal(isNamingEditor(null), false);

console.log('ui-refresh tests OK');
