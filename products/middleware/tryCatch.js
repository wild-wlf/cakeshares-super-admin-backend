/**
 *
 * @param {Function} fn
 * @returns
 */
module.exports = fn => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      let message = null;
      let code = null;
      if (error instanceof TypeError) {
        message = `Invalid request${error.message && ': ' + error.message}`;
        code = 400;
      } else if (error instanceof SyntaxError) {
        message = `Syntax error${error.message && ': ' + error.message}`;
        code = 400;
      } else if (error instanceof RangeError) {
        message = `Invalid range${error.message && ': ' + error.message}`;
        code = 400;
      } else {
        let [msg, errorCode] = error.message.split(':');
        if (typeof errorCode === 'string') {
          errorCode = Number(errorCode.trim());
        }
        if (errorCode) {
          message = msg;
          code = errorCode;
        } else {
          message = error.message;
          code = 500;
        }
      }

      return res.status(code).json({
        message: message,
        success: false,
      });
    }
  };
};
