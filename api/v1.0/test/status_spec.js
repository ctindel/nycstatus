TEST_USERS = require('/tmp/nycstatusTestCreds.js');

var frisby = require('frisby');
var tc = require('./config/test_config');
var async = require('async');
var dbConfig = require('./config/db.js');

frisby.create('GET status')
    .get(tc.url + '/status')
    .expectStatus(200)
    .expectHeader('Content-Type', 'application/json; charset=utf-8')
    .expectJSONTypes('currentStatus', 
                     { mtaStatus : Object, 
                       uberStatus : Object,
                       weatherStatus : Object})
    .toss()
