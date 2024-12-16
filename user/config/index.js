/* eslint-disable no-undef */
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  window: process.env.WINDOW,
  max_limit: process.env.MAX_LIMIT,
  port: process.env.PORT,
  secret: process.env.SECRET,
  mongo_string: process.env.MONGO_URI,
  base_url: process.env.BASE_URL,
  access_key: process.env.ACCESS_KEY,
  aws_access_key: process.env.AWS_ACCESS_KEY_ID,
  aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
  aws_region: process.env.AWS_REGION,
  aws_s3_bucket_name: process.env.AWS_S3_BUCKET_NAME,
  stripe_secrete_key: process.env.STRIPE_SECRETE_KEY,
  stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY,
  google_login_api_key: process.env.GOOGLE_LOGIN_API_KEY,
};
