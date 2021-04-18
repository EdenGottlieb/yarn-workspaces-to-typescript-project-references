'use strict';

var yargs = require('yargs');
var fs = require('fs-extra');
var execa = require('execa');
var pkgDir = require('pkg-dir');
var path = require('path');
var prettier = require('prettier');
var stringify = require('json-stable-stringify');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var yargs__default = /*#__PURE__*/_interopDefaultLegacy(yargs);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var execa__default = /*#__PURE__*/_interopDefaultLegacy(execa);
var pkgDir__default = /*#__PURE__*/_interopDefaultLegacy(pkgDir);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var prettier__default = /*#__PURE__*/_interopDefaultLegacy(prettier);
var stringify__default = /*#__PURE__*/_interopDefaultLegacy(stringify);

function isNotUndefined(x) {
  return x !== undefined;
}

const stringifyTSConfig = async (tsConfig, path) => {
  const text = stringify__default['default'](tsConfig, {
    space: 2
  });
  const prettierOptions = await prettier__default['default'].resolveConfig(path);
  return prettier__default['default'].format(text, { ...prettierOptions,
    parser: 'json'
  });
};

const run = async ({
  mode
}) => {
  const root = await pkgDir__default['default'](process.cwd());

  if (!root) {
    throw new Error('Could not find workspace root.');
  }

  const rootTSConfigPath = path__default['default'].join(root, 'tsconfig.json');
  const {
    stdout: raw
  } = await execa__default['default']('yarn', ['--silent', 'workspaces', 'info', '--json']);
  const workspaceInfo = JSON.parse(raw);
  const packageNames = Object.keys(workspaceInfo);

  const getPackageInfo = async name => {
    const info = workspaceInfo[name];
    const tsConfigPath = path__default['default'].join(root, info.location, 'tsconfig.json');
    const tsConfigExists = await fs__default['default'].pathExists(tsConfigPath);
    return {
      tsConfigPath: tsConfigExists ? tsConfigPath : undefined,
      name
    };
  };

  const idk = await Promise.all(packageNames.map(async name => getPackageInfo(name)));
  const nameToConfigPath = idk.reduce((acc, next) => ({ ...acc,
    [next.name]: next.tsConfigPath
  }), {});

  const processPackage = async (name) => {
    const info = workspaceInfo[name];
    const tsConfigPath = nameToConfigPath[name];

    if (tsConfigPath) {
      const location = path__default['default'].join(root, info.location);
      const tsConfigString = await fs__default['default'].readFile(tsConfigPath, {
        encoding: 'utf8'
      });
      const tsConfig = JSON.parse(tsConfigString);
      const tsConfigTarget = { ...tsConfig,
        references: info.workspaceDependencies.map(v => nameToConfigPath[v]).filter(isNotUndefined).map(v => path__default['default'].relative(location, v)).map(v => ({
          path: v
        }))
      };
      const tsConfigTargetString = await stringifyTSConfig(tsConfigTarget, tsConfigPath);
      const tsConfigMatchesTarget = tsConfigString === tsConfigTargetString;

      if (mode === 'write') {
        if (!tsConfigMatchesTarget) {
          await fs__default['default'].writeFile(tsConfigPath, tsConfigTargetString);
          return {
            wasOutOfSync: true,
            wasWritten: true
          };
        } else {
          return {
            wasOutOfSync: false,
            wasWritten: false
          };
        }
      }

      if (mode === 'check') {
        if (!tsConfigMatchesTarget) {
          return {
            wasOutOfSync: true,
            wasWritten: false
          };
        } else {
          return {
            wasOutOfSync: false,
            wasWritten: false
          };
        }
      }

      throw new Error(`Invalid mode: ${mode}`);
    }

    return {};
  };

  const infoAboutPackages = [];
  await Promise.all(packageNames.map(async name => {
    const i = await processPackage(name);
    infoAboutPackages.push(i);
  }));
  const rootTSConfigString = await fs__default['default'].readFile(rootTSConfigPath, {
    encoding: 'utf8'
  });
  const rootTSConfig = JSON.parse(rootTSConfigString);
  const rootTSConfigTarget = { ...rootTSConfig,
    files: [],
    references: idk.map(v => v.tsConfigPath).filter(isNotUndefined).map(v => path__default['default'].relative(root, v)).map(v => ({
      path: v
    }))
  };
  const rootTSConfigTargetString = await stringifyTSConfig(rootTSConfigTarget, rootTSConfigPath);
  const rootTSConfigMatchesTarget = rootTSConfigString === rootTSConfigTargetString;

  if (mode === 'check') {
    if (infoAboutPackages.some(v => v.wasOutOfSync) || !rootTSConfigMatchesTarget) {
      console.error('Project references are not in sync with dependencies.\nYou can run "yarn yarn-workspaces-to-typescript-project-references write" to fix them.');
      process.exit(1);
    }
  } else {
    if (infoAboutPackages.some(v => v.wasOutOfSync) || !rootTSConfigMatchesTarget) {
      await fs__default['default'].writeFile(rootTSConfigPath, rootTSConfigTargetString);
      console.log('Project references were synced with dependencies.');
      process.exit(0);
    } else {
      console.log('Project references are in sync with dependencies.');
      process.exit(0);
    }
  }
};

yargs__default['default'].command('check', 'Check that the tsconfig file project references are synced with dependencies.', v => v, async () => {
  await run({
    mode: 'check'
  });
}).command('write', 'Write the dependencies to tsconfig file project references.', v => v, async () => {
  await run({
    mode: 'write'
  });
}).parse();
