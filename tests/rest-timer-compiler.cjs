const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');
const path = require('node:path');

test('compiled timer updates on clock ticks and clears immediately on Skip', async () => {
  const file = path.join(__dirname, '../src/components/training/rest-timer.tsx');
  const { code } = babel.transformFileSync(file, {
    babelrc: false, configFile: false,
    plugins: ['babel-plugin-react-compiler', '@babel/plugin-transform-modules-commonjs'],
    presets: [['@babel/preset-react', { runtime: 'automatic' }], ['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
  });
  let now = 1000000;
  let deadline = 1090000;
  let tick;
  let effect;
  let index = 0;
  const states = [];
  const cache = [];
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (value) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef(initial) { const i = index++; return states[i] ??= { current: initial }; },
    useEffect(callback) { if (!effect) effect = callback; },
  };
  const training = {
    getRestTimer: () => ({ state: deadline === null ? 'idle' : 'running', remainingSeconds: Math.ceil((deadline - now) / 1000) }),
    skipRest: async () => { deadline = null; },
  };
  const element = (type, props) => ({ type, props: props ?? {} });
  const rn = { AppState: { addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: (value) => value }, Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View' };
  const modules = {
    react, 'react/compiler-runtime': { c: () => cache }, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': rn, './pulse': { pulse: {}, pulseStyles: {} }, '@/training/provider': { useTraining: () => ({ training, restDeadline: deadline }) },
  };
  const module = { exports: {} };
  const FakeDate = class extends Date { static now() { return now; } };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => { if (!(name in modules)) throw Error(name); return modules[name]; }, Date: FakeDate, setInterval: (cb) => { tick = cb; return 1; }, clearInterval() {} }, { filename: file });
  const render = () => { index = 0; return module.exports.RestTimer(); };
  const nodes = (node) => node && typeof node === 'object' ? [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] : [];
  const text = (node) => nodes(node).filter((entry) => entry.type === 'Text').map((entry) => [entry.props.children].flat().join('')).join(' ');
  let tree = render();
  effect();
  assert.match(text(tree), /1:30/);
  now += 1000;
  tick();
  tree = render();
  assert.match(text(tree), /1:29/);
  const skip = nodes(tree).find((entry) => entry.props?.label === 'Skip' || entry.props?.accessibilityLabel === 'Skip rest');
  assert.ok(skip, 'Skip is available');
  skip.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  tree = render();
  assert.match(text(tree), /Ready/);
  assert.equal(nodes(tree).some((entry) => entry.props?.label === 'Skip' || entry.props?.accessibilityLabel === 'Skip rest'), false);
});
