'use strict';

/**
 * @file 数据库 schema 生成
 * @author Yourtion Guo <yourtion@gmail.com>
 */

const { mysql, co, TYPES, config, utils } = require('../src/global');
const util = require('util');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('eapi:table_info:');

const SCHEMA_PATH = path.resolve(__dirname, '../src/schemas');
const tablePrefix = config.tablePrefix || '';

const SKIP = ['created_at', 'updated_at'];

function* tableInfo(prefix, name) {
  const res = yield mysql.queryAsync('show full columns from `' + prefix + name + '`');
  return res;
}

function* tableToScheam(tablePrefix, tableName){
  const table = yield* tableInfo(tablePrefix, tableName);
  return convertTable(table);
}

function convertFiled(field, nullable) {
  if (field.indexOf('char') > -1) {
    return nullable ? TYPES.NullableString : TYPES.String;
  }
  if (field.indexOf('int') > -1) {
    return nullable ? TYPES.NullableInteger : TYPES.Integer;
  }
  if (field === 'timestamp') {
    return nullable ? TYPES.NullableInteger : TYPES.Integer;
  }
  if(field.indexOf('enum') > -1){
    return TYPES.ENUM;
  }
  if (field === 'tinytext' || field === 'mediumtext') {
    return nullable ? TYPES.NullableString : TYPES.String;
  }
  if (field === 'text') {
    return nullable ? TYPES.NullableString : TYPES.String;
  }
  if(field === 'date') {
    return TYPES.Date;
  }
  console.log(field);
  return TYPES.Any;
}

function enumToArray(e) {
  return e.replace('enum(', '').replace(')', '').replace(/'/g, '').split(',');
}

function convertTable(table) {
  const res = {};
  for(const row of table){
    if (SKIP.indexOf(row.Field) > -1) continue;
    // console.log(row.Field,row.Type, row.Comment);
    res[row.Field] = {
      type: convertFiled(row.Type, row.Null === 'YES', row.Field),
      comment: row.Comment,
    };
    if(res[row.Field].type === TYPES.ENUM) {
      res[row.Field].params = enumToArray(row.Type);
    }
  }
  return res;
}

const genAll = co.wrap(function* (writeTofile){
  const res = {};
  const tables = yield mysql.queryAsync('show table status');
  debug(tables);
  for(const t of tables){
    const tableFullName = t['Name'];
    if(tableFullName.indexOf(tablePrefix) === -1) continue;
    const tableName = tableFullName.replace(tablePrefix, '');
    const tableCommet = t['Comment'];
    debug(tablePrefix, tableName, tableCommet);
    res[tableName] = yield* tableToScheam(tablePrefix, tableName);
    debug(res[tableName]);
    if(!writeTofile) {
      console.log(tableName + ':');
      console.log(util.inspect(res[tableName], false, null));
      console.log('----------------------------------------');
    } else {
      const str = `'use strict';

/**
 * @file ${ tableName } schema ${ tableCommet }
 * @author Yourtion Guo <yourtion@gmail.com>
 */

module.exports = ${ util.inspect(res[tableName], false, null) };
`.replace('module.exports = { ', 'module.exports = {\n  ').replace('} };', '},\n};');

      fs.writeFileSync(SCHEMA_PATH + '/' + tableName + '.js', str, 'utf8');
      const indexPath = SCHEMA_PATH + '/index.js';
      const index = fs.readFileSync(indexPath).toString();
      const nameCamel = utils.underscore2camelCase(tableName);
      const schemaText = `${ nameCamel }Schema: require('./${ tableName }')`;
      if(index.indexOf(schemaText) === -1) {
        const indexNew = index.replace('};', `  ${ schemaText },\n};`);
        fs.writeFileSync(indexPath, indexNew, 'utf8');
      }
    }
  }
  // console.log(res);
});

const genTable = co.wrap(function* (tablePrefix, tableName){
  debug(tablePrefix, tableName);
  const res = yield* tableToScheam(tablePrefix, tableName);
  console.log(util.inspect(res, false, null));
});

debug(process.argv);

if(process.argv.length > 2) {
  let fn = genTable;
  let param = false;
  if(process.argv[2] === 'all') {
    fn = genAll;
    if(process.argv.length === 4) {
      param = true;
    }
  } else {
    param = process.argv[2];
  }
  fn(param)
    .then(_res => process.exit(0))
    .catch(err => {
      console.log(err);
      process.exit(-1);
    });
} else {
  console.log('node table_info.js `tableName | all` `writeTofile`');
  process.exit(-1);
}
