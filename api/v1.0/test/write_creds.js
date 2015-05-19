TU_EMAIL_REGEX = new RegExp('^testuser*');
TEST_CREDS_TMP_FILE = '/tmp/nycstatusTestCreds.js';

var async = require('async');
var dbConfig = require('./config/db.js');
var mongodb = require('mongodb');
assert = require('assert');

var mongoClient = mongodb.MongoClient
var nycstatus_test_db = null;
var users_array = null;

writeCredsArray = [
    function connectDB(callback) {
        mongoClient.connect(dbConfig.testDBURL, function(err, db) {
            assert.equal(null, err);
            nycstatus_test_db = db; 
            callback(null);
        });
    },
    function lookupUserKeys(callback) {
        console.log("lookupUserKeys");
        user_coll = nycstatus_test_db.collection('user');
        user_coll.find({email : TU_EMAIL_REGEX}).toArray(function(err, users) {
            users_array = users;
            callback(null);
        });
    },
    function writeCreds(callback) {
        console.log("writeCreds");
        var fs = require('fs');
        fs.writeFileSync(TEST_CREDS_TMP_FILE, 'TEST_USERS = ');
        fs.appendFileSync(TEST_CREDS_TMP_FILE, JSON.stringify(users_array));
        fs.appendFileSync(TEST_CREDS_TMP_FILE, '; module.exports = TEST_USERS;');
        callback(0);
    },
    function closeDB(callback) {
        nycstatus_test_db.close();
    },
    function callback(err, results) {
        console.log("Write creds callback");
        console.log("Results: %j", results);
    }
]

async.series(writeCredsArray);
