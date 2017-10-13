'use strict';

/**
 * @file base model 基础模块
 * @author Yourtion Guo <yourtion@gmail.com>
 */
const { log4js, mysql, errors, squel, utils, co, _, config } = require('../global');
const logger = log4js.getLogger('mysql');

const SELETE_OPT = { autoQuoteTableNames: true, autoQuoteFieldNames: true };

function removeUndefined(object) {
  Object.keys(object).forEach(key => object[key] === undefined && delete object[key]);
  if (Object.keys.length === 0) throw errors.dataBaseError('Object is empty');
  return object;
}

function _parseWhere(sql, conditions) {
  Object.keys(conditions).forEach(k => {
    if (k.indexOf('$') === 0) {
      if (Array.isArray(conditions[k])) {
        sql.where(...conditions[k]);
      } else {
        sql.where(conditions[k]);
      }
    } else if (_.isArray(conditions[k])) {
      sql.where(`${ k } in ?`, conditions[k]);
    } else {
      sql.where(`${ k } = ?`, conditions[k]);
    }
  });
}

function errorHandler(err) {
  if (!isNaN(err.code - 0)) throw err;
  const source = utils.getErrorSourceFromCo(err);
  logger.error({
    code: err.code,
    msg: err.sqlMessage,
    sql: err.sql,
    source,
  });
  switch (err.code) {
  case 'ER_DUP_ENTRY':
    throw errors.repeatError();
  case 'ER_ROW_IS_REFERENCED_2':
    throw errors.dependError();
  default:
    throw errors.dataBaseError();
  }
}

class Base {

  /**
     * Creates an instance of Base.
     * @param {String} table 表名
     * @param {Object} [options={}] 
     *   - {Object} fields 默认列
     *   - {Object} order 默认排序字段
     * @memberof Base
     */
  constructor(table, options = {}) {
    this.squel = squel;
    this.table = table;
    this.fields = options.fields || [];
    this.order = options.order;
    this.SELETE_OPT = SELETE_OPT;
    this.removeUndefined = removeUndefined;
  }

  /**
     * 输出 SQL Debug
     * 
     * @param {String} name Debug 前缀
     * @returns {String} SQL 
     * @memberof Base
     */
  debugSQL(name) {
    return (sql) => {
      logger.debug(` ${ name } : ${ sql }`);
      return sql;
    };
  }

  /**
     * 查询方法（内部查询尽可能调用这个，会打印Log）
     * 
     * @param {String} sql SQL字符串
     * @param {Object} [connection=mysql] Mysql连接，默认为pool
     * @returns {Promise}
     * @memberof Base
     */
  query(sql, connection = mysql) {
    logger.debug(sql);
    return connection.queryAsync(sql).catch(err => {
      errorHandler(err);
    });
  }

  _count(conditions = {}) {
    const sql = squel.select().from(this.table).field('COUNT(*)', 'c');
    _parseWhere(sql, conditions);
    return sql;
  }

  /**
     * 计算数据表 count
     * 
     * @param {Object} [conditions={}] 条件
     * @returns {Promise}
     * @memberof Base
     */
  count(conditions = {}) {
    const that = this;
    return co(function* () {
      const res = yield that.query(that._count(conditions).toString());
      return res && res[0] && res[0]['c'];
    });
  }

  _getById(id, fields) {
    if (id === undefined) throw errors.dataBaseError('`id` 不能为空');
    const sql = squel.select(SELETE_OPT).from(this.table).where('id = ?', id).limit(1);
    fields.forEach(f => sql.field(f));
    return sql;
  }

  /**
     * 根据 ID 获取数据
     * 
     * @param {Number} id 主键ID
     * @param {Array} [fields=this.fields] 所需要的列数组
     * @returns {Promise}
     * @memberof Base
     */
  getById(id, fields = this.fields) {
    const that = this;
    return co(function* () {
      const res = yield that.query(that._getById(id, fields).toString());
      return res && res[0];
    });
  }

  _getOneByField(object = {}, fields = this.fields) {
    const sql = squel.select(SELETE_OPT).from(this.table).limit(1);
    fields.forEach(f => sql.field(f));
    _parseWhere(sql, object);
    return sql;
  }

  /**
     * 根据查询条件获取一条记录
     * 
     * @param {Object} [object={}] 字段、值对象
     * @param {Array} [fields=this.fields] 所需要的列数组
     * @returns {Promise}
     * @memberof Base
     */
  getOneByField(object = {}, fields = this.fields) {
    const that = this;
    return co(function* () {
      const res = yield that.query(that._getOneByField(object, fields).toString());
      return res && res[0];
    });
  }

  _deleteById(id, limit = 1) {
    if (id === undefined) throw errors.dataBaseError('`id` 不能为空');
    return squel.delete().from(this.table).where('id = ?', id).limit(limit);
  }

  /**
     * 根据 ID 删除数据
     * 
     * @param {Number} id 主键ID
     * @param {Number} [limit=1] 删除条数
     * @returns {Promise}
     * @memberof Base
     */
  deleteById(id, limit = 1) {
    return this.query(this._deleteById(id, limit).toString());
  }

  _deleteByField(key, limit = 1) {
    const sql = squel.delete().from(this.table).limit(limit);
    Object.keys(key).forEach(k => sql.where(k + (_.isArray(key[k]) ? ' in' : ' =') + ' ? ', key[k]));
    return sql;
  }

  /**
     * 根据查询条件删除数据
     * 
     * @param {Object} [object={}] 字段、值对象
     * @param {Number} [limit=1] 删除条数
     * @returns {Promise}
     * @memberof Base
     */
  deleteByField(key, limit = 1) {
    return this.query(this._deleteByField(key, limit).toString());
  }

  /**
     * 根据查询条件获取记录
     * 
     * @param {Object} [object={}] 字段、值对象
     * @param {Array} [fields=this.fields] 所需要的列数组
     * @returns {Promise}
     * @memberof Base
     */
  getByField(where = {}, fields = this.fields) {
    return this.list(where, fields, 999);
  }

  _insert(object = {}) {
    removeUndefined(object);
    return squel.insert().into(this.table).setFields(object);
  }

  /**
     * 插入一条数据
     * 
     * @param {Object} [object={}] 插入的数据对象
     * @returns {Promise}
     * @memberof Base
     */
  insert(object = {}) {
    return this.query(this._insert(object).toString());
  }

  _batchInsert(array) {
    array.forEach(o => removeUndefined(o));
    return squel.insert().into(this.table).setFieldsRows(array);
  }

  /**
     * 批量插入数据
     * 
     * @param {Array<Object>} array 插入的数据对象数组
     * @returns {Promise}
     * @memberof Base
     */
  batchInsert(array) {
    return this.query(this._batchInsert(array).toString());
  }

  _updateById(id, fields, raw = false) {
    if (id === undefined) throw errors.dataBaseError('`id` 不能为空');
    removeUndefined(fields);
    const sql = squel.update().table(this.table).where('id = ?', id);
    if (raw) {
      Object.keys(fields).forEach(k => {
        if (k.indexOf('$') === 0) {
          sql.set(fields[k]);
        } else {
          sql.set(`${ k } = ?`, fields[k]);
        }
      });
    } else {
      sql.setFields(fields);
    }
    return sql;
  }

  /**
     * 根据 ID 更新记录
     * 
     * @param {Number} id 主键ID
     * @param {Object} fields 更新的内容对象
     * @returns {Promise}
     * @memberof Base
     */
  updateById(id, fields, raw = false) {
    const that = this;
    return co(function* () {
      const res = yield that.query(that._updateById(id, fields, raw).toString());
      return res && res.changedRows === 1;
    });
  }

  _createOrUpdate(fields, update, raw = false) {
    removeUndefined(fields);
    const sql = squel.insert().into(this.table);
    if (raw) {
      Object.keys(fields).forEach(k => {
        if (k.indexOf('$') === 0) {
          sql.set(fields[k]);
        } else {
          sql.set(`${ k } = ?`, fields[k]);
        }
      });
    } else {
      sql.setFields(fields);
    }
    update.forEach(k => {
      if (fields[k] !== undefined) sql.onDupUpdate(k, fields[k]);
    });
    return sql;
  }

  /**
     * 创建一条记录，如果存在就更新
     * 
     * @param {Object} fields 创建记录对象
     * @param {Array} update 更新字段
     * @returns {Promise}
     * @memberof Base
     */
  createOrUpdate(fields, update) {
    const that = this;
    return co(function* () {
      const res = yield that.query(that._createOrUpdate(fields, update).toString());
      return res && res.changedRows === 1;
    });
  }

  _updateByField(key, fields, raw = false) {
    if (!key || Object.keys(key).length < 1) throw errors.dataBaseError('`key` 不能为空');
    removeUndefined(fields);
    const sql = squel.update().table(this.table);
    if (raw) {
      Object.keys(fields).forEach(k => {
        if (k.indexOf('$') === 0) {
          sql.set(fields[k]);
        } else {
          sql.set(`${ k } = ?`, fields[k]);
        }
      });
    } else {
      sql.setFields(fields);
    }
    Object.keys(key).forEach(k => sql.where(`${ k } = ?`, key[k]));
    return sql;
  }

  /**
     * 根据查询条件更新记录
     * 
     * @param {Object} key 查询条件对象
     * @param {Object} fields 更新的内容对象
     * @returns {Promise}
     * @memberof Base
     */
  updateByField(key, fields) {
    const that = this;
    return co(function* () {
      const res = yield that.query(that._updateByField(key, fields).toString());
      return res && res.changedRows === 1;
    });
  }

  _incrFields(id, fields, num = 1) {
    if (id === undefined) throw errors.dataBaseError('`id` 不能为空');
    const sql = squel.update().table(this.table).where('id = ?', id);
    fields.forEach(f => sql.set(`${ f } = ${ f } + ${ num }`));
    return sql;
  }

  /**
     * 根据ID对数据列执行加一操作
     * 
     * @param {Number} id 主键ID
     * @param {Array} fields 需要更新的列数组
     * @returns {Promise}
     * @memberof Base
     */
  incrFields(id, fields, num = 1) {
    return this.query(this._incrFields(id, fields, num).toString());
  }

  _list(conditions = {}, fields = this.fields, limit = 999, offset = 0, order = this.order, asc = true) {
    removeUndefined(conditions);
    const sql = squel.select(SELETE_OPT).from(this.table).offset(offset).limit(limit);
    fields.forEach(f => sql.field(f));
    _parseWhere(sql, conditions);
    if (order) sql.order(order, asc);
    return sql;
  }

  /**
     * 根据条件获取列表
     * 
     * @param {Object} [conditions={}] 查询条件对象
     * @param {Array} [fields=this.fields] 需要查询的字段
     * @param {Number} [limit=999] 限制条数
     * @param {Number} [offset=0] 跳过数量
     * @param {String} [order=this.order] 排序字段
     * @param {Boolean} [asc=true] 是否正向排序
     * @returns {Promise}
     * @memberof Base
     */
  list(conditions = {}, fields = this.fields, limit = 999, offset = 0, order = this.order, asc = true) {
    return this.query(this._list(conditions, fields, limit, offset, order, asc).toString());
  }


  _search(keyword, search, fields = this.fields, limit = 10, order = this.order, asc = true) {
    if (!keyword || search.length < 1) return [];
    const sql = squel.select(SELETE_OPT).from(this.table).limit(limit);
    fields.forEach(f => sql.field(f));
    const exp = squel.expr();
    search.forEach(k => {
      exp.or(`${ k } like ?`, '%' + keyword + '%');
    });
    sql.where(exp);
    if (order) sql.order(order, asc);
    return sql;
  }

  /**
     * 根据关键词进行搜索
     * 
     * @param {String} keyword 关键词
     * @param {Array} search 搜索字段
     * @param {Array} [fields=this.fields] 需要查询的字段
     * @param {number} [limit=10] 限制条数
     * @param {any} [order=this.order] 排序字段
     * @param {boolean} [asc=true] 是否正向排序
     * @returns {Promise}
     * @memberof Base
     */
  search(keyword, search, fields = this.fields, limit = 10, order = this.order, asc = true) {
    return this.query(this._search(keyword, search, fields, limit, order, asc).toString());
  }

  /**
     * 根据条件获取分页内容（比列表多处总数计算）
     * 
     * @param {Object} [conditions={}] 查询条件对象
     * @param {Array} [fields=this.fields] 需要查询的字段
     * @param {Number} [limit=999] 限制条数
     * @param {Number} [offset=0] 跳过数量
     * @param {String} [order=this.order] 排序字段
     * @param {Boolean} [asc=true] 是否正向排序
     * @returns {Promise}
     * @memberof Base
     */
  page(conditions = {}, fields = this.fields, limit = 30, offset = 0, order = this.order, asc = true) {
    const that = this;
    return co(function* () {
      const res = yield that.list(conditions, fields, limit, offset, order, asc);
      const count = yield that.count(conditions);
      return { count, list: res };
    });
  }

  /**
     * 执行事务（通过传人方法）
     * 
     * @param {String} name 
     * @param {Function} func 
     * @memberof Base
     */
  transactions(name, func) {
    const that = this;
    return co(function* () {
      if (!name) throw errors.dataBaseError('`name` 不能为空');
      const tid = utils.randomLetter(6);
      const debug = that.debugSQL(`Transactions[${ tid }] - ${ name }`);
      const connection = yield mysql.getConnectionAsync();
      connection.debugQuery = (sql) => {
        debug(sql);
        return connection.queryAsync(sql);
      };
      yield connection.beginTransactionAsync(); // 开始事务
      debug('Transaction Begin');
      try {
        const result = yield* func(connection);
        yield connection.commitAsync(); // 提交事务
        debug('result: ', result);
        debug('Transaction Done');
        return result;
      } catch (err) {
        // 回滚错误
        // console.log(err);
        yield connection.rollbackAsync();
        debug('Transaction Rollback', err.code < 0);
        errorHandler(err);
      } finally {
        connection.release();
      }
    });
  }

  /**
     * 执行事务（通过传人SQL语句数组）
     * 
     * @param {Array<String>} sqls SQL语言数组
     * @returns {Promise}
     * @memberof Base
     */
  transactionSQLs(sqls) {
    return co(function* () {
      if (!sqls || sqls.length < 1) throw errors.dataBaseError('`sqls` 不能为空');
      logger.debug('Begin Transaction');
      const connection = yield mysql.getConnectionAsync();
      yield connection.beginTransactionAsync();
      try {
        for (const sql of sqls) {
          logger.debug(`Transaction SQL: ${ sql }`);
          yield connection.queryAsync(sql);
        }
        const res = yield connection.commitAsync();
        logger.debug('Done Transaction');
        return res;
      } catch (err) {
        yield connection.rollbackAsync();
        logger.debug('Rollback Transaction');
        errorHandler(err);
      } finally {
        yield connection.release();
      }
    });
  }

  /**
     * 拼凑查询列表的sql语句
     * @param {Object}  condition 
     * @param {Object}  condition.where 查询限制条件
     * @param {Squel}   condition.squel sql拼凑对象
     * @param {Number}  condition.offset 开始下标
     * @param {Number}  condition.limit 查询条数
     * @param {Number}  condition.order 排序字段
     * @param {Number}  condition.asc  是否增序
     */
  _listSql(condition = {}) {

    const { squel, where = {}, offset, limit, order, asc } = condition;

    const sql = squel.offset(offset).limit(limit);
    _parseWhere(sql, where);
    if (order) sql.order(order, asc);
    return sql;
  }

  /**
     * 拼凑查询总数的sql语句
     * @param {Object}  condition 
     * @param {Object}  condition.where 查询限制条件
     * @param {Squel}   condition.squel sql拼凑对象
     */
  _countSql(condition = {}) {
    const { squel, where } = condition;
    const sql = squel.field('COUNT(*)', 'c');
    _parseWhere(sql, where);
    return sql;
  }

  /**
     * 生成join查询列表的函数
     * @param {Object}  table 表相关信息
     * @param {Object}  table.pri 主表
     * @param {Object}  table.foreign 副表
     * @param {String}  table.pri.table 主表名字
     * @param {String}  table.pri.key 主表链接key
     * @param {Array}   table.pri.fields 主表字段
     * @param {String}  table.foreign.table 主表名字
     * @param {String}  table.foreign.key 主表链接key
     * @param {Array}   table.foreign.fields 主表字段
     */
  _makeJoinList(table = { pri: {}, foreign: {}}) {
    const { pri, foreign } = table;
    return (conditions) => {
      const {
        where = {},
        limit = 999,
        offset = config.model.offset,
        order = this.order,
        asc = config.model.asc,
        exec = true,
        leftJoin = false,
      } = conditions;
      const { table: priTable, key: priKey, fields: priFields } = pri;
      const { table: foreignTable, key: foreignKey, fields: foreignFields } = foreign;
      // console.log(priFields, foreignFields, priFields.map(item => _.isArray(item) ? [ `a.${ item[0] }`, item[1] ] : `a.${ item }`));
      const fields = _.concat(
        priFields.map(item => {
          // console.log(decorate)
          if (_.isArray(item)) {
            const decorate = item[0].split('$$');
            return decorate.length > 1 ? [ `${ decorate[0] }(a.${ decorate[1] })`, item[1] ] : [ `${ item[0] }`, item[1] ];
          }
          const decorate = item.split('$$');
          return decorate.length > 1 ? `${ decorate[0] }(a.${ decorate[1] })` : `a.${ item }`;
        }),
        foreignFields.map(item => {
          if (_.isArray(item) && item[0].indexOf('(') > -1) {
            return [ item[0], item[1] ];
          }
          return _.isArray(item) ? [ `b.${ item[0] }`, item[1] ] : `b.${ item }`;
        })
      );
      let sql = this.squel.select().from(priTable, 'a');
      if (leftJoin) {
        sql.left_join(foreignTable, 'b', `a.${ priKey }=b.${ foreignKey }`);
      } else {
        sql.join(foreignTable, 'b', `a.${ priKey }=b.${ foreignKey }`);
      }
      fields.forEach(f => _.isArray(f) ? sql.field(f[0], f[1]) : sql.field(f));

      const newWhere = _.transform(where, (result, value, key) => {
        if (key.indexOf('$') === -1) {
          result['a.' + key] = value;
        } else {
          result[key] = value;
        }
      });
      const newOrder = order ? 'a.' + order : order;

      sql = this._listSql({ squel: sql, offset, limit, order: newOrder, asc, where: newWhere });
      return exec ? this.query(sql.toString()) : sql;
    };
  }

  /**
     * 生成join查询列表的总数函数
     * @param {Object}  table 表相关信息
     * @param {Object}  table.pri 主表
     * @param {Object}  table.foreign 副表
     * @param {String}  table.pri.table 主表名字
     * @param {String}  table.pri.key 主表链接key
     * @param {String}  table.foreign.table 主表名字
     * @param {String}  table.foreign.key 主表链接key
     */
  _makeJoinCount(table = { pri: {}, foreign: {}}) {
    const that = this;
    const { pri, foreign } = table;
    return (condition) => {
      return co(function* () {
        const { where, exec = true, leftJoin = false } = condition;
        const { table: priTable, key: priKey } = pri;
        const { table: foreignTable, key: foreignKey } = foreign;
        const newWhere = _.transform(where, (result, value, key) => {
          result['a.' + key] = value;
        });
        let sql = that.squel.select().from(priTable, 'a');
        if (leftJoin) {
          sql.left_join(foreignTable, 'b', `a.${ priKey }=b.${ foreignKey }`);
        } else {
          sql.join(foreignTable, 'b', `a.${ priKey }=b.${ foreignKey }`);
        }
        sql = that._countSql({ squel: sql, where: newWhere });
        if (exec) {
          const res = yield that.query(sql.toString());
          return res && res[0] && res[0]['c'];
        }
        return sql;
      });
    };
  }

  /**
     * 生成join查询列表的函数
     * @param {Object}  table 表相关信息
     * @param {Object}  table.pri 主表
     * @param {Object}  table.foreign 副表
     * @param {String}  table.pri.table 主表名字
     * @param {String}  table.pri.key 主表链接key
     * @param {Array}   table.pri.fields 主表字段
     * @param {String}  table.foreign.table 主表名字
     * @param {String}  table.foreign.key 主表链接key
     * @param {Array}   table.foreign.fields 主表字段
     */
  _makeJoinPage(table = { pri: {}, foreign: {}}) {
    const selectList = this._makeJoinList(table);
    const selectCount = this._makeJoinCount(table);
    return (conditions) => {
      return co(function* () {
        const list = yield selectList(conditions);
        const count = yield selectCount(conditions);
        return { list, count };
      });
    };
  }

  /**
     * 
     * 获取统计信息通用方法
     * 
     * @param {String} start 开始时间
     * @param {String} end 结束时间
     * @returns {Promise}
     * @memberof Base
     */
  getStatistics(start, end) {
    const that = this;
    return co(function* () {
      const table = squel.select().from(that.table);
      const sql0 = table.clone().field('count(id)', 'total').field(table.clone().field('count(id)').where('date(created_at) = curdate()'), 'today');
      const [ status ] = yield that.query(sql0.toString());
      const sql = table.clone().where('created_at >= ?', start).where('created_at <= ?', end).order('day', false);
      sql.field('count(id)', 'day_count');
      sql.field('date(created_at)', 'day');
      sql.field(table.clone().field('count(id)').where('created_at <= day'), 'day_total');
      sql.group('date(created_at)');
      const list = yield that.query(sql.toString());
      return { status, list };
    });
  }

  _getAllData(conditions = {}, fields = this.fields, order = this.order, asc = true) {
    const sql = squel.select(SELETE_OPT).from(this.table);
    fields.forEach(f => sql.field(f));
    _parseWhere(sql, conditions);
    if (order) sql.order(order, asc);
    return sql;
  }

  getAllData(conditions = {}, fields = this.fields, order = this.order, asc = true) {
    const sql = this._getAllData(conditions, fields, order, asc);
    return co(function* () {
      logger.debug('Get AllData');
      const connection = yield mysql.getConnectionAsync();
      return { connection, sql };
    });
  }
}

module.exports = Base;