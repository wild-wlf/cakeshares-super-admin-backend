const mongoose = require('mongoose');
const path = require('path');

const FETCH_MODEL = (name, db = false) => {
  const { Schema } = mongoose;
  // eslint-disable-next-line no-undef
  const model = require(path.resolve(`${__dirname}/../models/`, `${name}.js`));

  try {
    if (typeof model === 'function') {
      const db_conn_check = ['cakeshares'];
      const { schema, collection } = model(mongoose);

      if (name !== collection) {
        throw new Error(`ERROR : NAME OF MODAL IS ${name} in schema its :${collection}`);
      }

      const modelSchema = new Schema(schema, {
        collection,
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
      });

      if (db && db_conn_check.includes(db)) {
        const DB_CONN = mongoose.connection.useDb(db);
        return DB_CONN.model(name, modelSchema);
      }

      return mongoose.model(name, modelSchema);
    } else {
      throw new Error(`ERROR : MISSING MODEL FOR SCHEMA ${name}`);
    }
  } catch (err) {
    console.error('ERROR: ', err);
  }
};

global.ADMIN = FETCH_MODEL('admin');
global.ADMIN_JWT = FETCH_MODEL('admin_jwt');
global.USER = FETCH_MODEL('user');
global.USER_JWT = FETCH_MODEL('user_jwt');
global.BANK = FETCH_MODEL('bank');
global.INHERITANCE = FETCH_MODEL('inheritance');
global.ROLE = FETCH_MODEL('roles');
global.PERMISSION = FETCH_MODEL('permissions');
global.PRODUCT = FETCH_MODEL('product');
global.INVESTMENT = FETCH_MODEL('investment');
global.WALLET = FETCH_MODEL('wallet');
global.KYC = FETCH_MODEL('kyc');
global.TRANSACTION = FETCH_MODEL('transaction');
global.NOTIFICATION = FETCH_MODEL('notification');
global.REQUEST_PAYMENT = FETCH_MODEL('request-payment');
global.PAYOUT = FETCH_MODEL('payout');
