var express = require('express');
var logger = require('../logger');     
var security = require('../config/security');
var validator = require('validator');
var async = require('async');
var Models = require('../../../shared/models');

exports.addAPIRouter = function(app, mongoose, stormpath) {

    var router = express.Router();

    var models = Models(mongoose);

    var userSchema = new mongoose.Schema({
        active: Boolean,
        email: { type: String, trim: true, lowercase: true },
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        sp_api_key_id: { type: String, trim: true },
        sp_api_key_secret: { type: String, trim: true },
        created: { type: Date, default: Date.now },
        lastLogin: { type: Date, default: Date.now },
    }, 
    { collection: 'user' }
    );

    userSchema.index({email : 1}, {unique:true});
    userSchema.index({sp_api_key_id : 1}, {unique:true});

    var UserModel = mongoose.model( 'User', userSchema );

    // GET
    app.get('/*', function(req, res, next) {
        res.contentType('application/json');
        next();
    });

    // POST
    app.post('/*', function(req, res, next) {
        res.contentType('application/json');
        next();
    });

    // PUT
    app.put('/*', function(req, res, next) {
        res.contentType('application/json');
        next();
    });

    // DELETE
    app.delete('/*', function(req, res, next) {
        res.contentType('application/json');
        next();
    });

    // test route to make sure everything is working (accessed at GET
    // http://localhost:8080/api/v1.0)
    router.get('/', function(req, res) {
        res.json({ message: 'hooray! welcome to our api!' });
    });

    router.post('/user/enroll', function(req, res) {
        errStr = undefined;

        // Structure required by Stormpath API
        account = {};
        account.givenName = account.surname = account.username = account.email
            = account.password = undefined;

        if (undefined == req.param('firstName')) {
            errStr = "Undefined First Name";
            logger.debug(errStr);
            res.status(400);
            res.json({error: errStr});
            return;
        } else if (undefined == req.param('lastName')) {
            errStr = "Undefined Last Name";
            logger.debug(errStr);
            res.status(400);
            res.json({error: errStr});
            return;
        } else if (undefined == req.param('email')) {
            errStr = "Undefined Email";
            logger.debug(errStr);
            res.status(400);
            res.json({error: errStr});
            return;
        } else if (undefined == req.param('password')) {
            errStr = "Undefined Password";
            logger.debug(errStr);
            res.status(400);
            res.json({error: errStr});
            return;
        }
        if (!validator.isEmail(req.param('email'))) {
            res.status(400);
            res.json({error: 'Invalid email format'})
            return;
        }
        UserModel.find({'email' : req.param('email')}, function dupeEmail(err, results) {
            if (err) {
                logger.debug("Error from dupeEmail check");
                console.dir(err);
                res.status(400);
                res.json(err);
                return;
            }
            if (results.length > 0) {
                res.status(400);
                res.json({error: 'Account with that email already exists.  Please choose another email.'});
                return;
            } else {
                account.givenName = req.param('firstName');
                account.surname = req.param('lastName');
                account.username = req.param('email');
                account.email = req.param('email');
                account.password = req.param('password');

                logger.debug("Calling stormPath createAccount API");
                app.get('stormpathApplication').createAccount(account, function(err, acc) {
                    if (err) { 
                        logger.debug("Stormpath error: " + err.developerMessage);
                        res.status(400);
                        res.json({error: err.userMessage});
                    } else {
                        acc.createApiKey(function(err,apiKey) {
                            if (err) { 
                                logger.debug("Stormpath error: " + err.developerMessage);
                                res.status(400);
                                res.json({error: err.userMessage});
                            } else {
                                //logger.debug(apiKey);
                                logger.debug("Successfully created new SP account for "
                                            + "firstName=" + acc.givenName
                                            + ", lastName=" + acc.surname
                                            + ", email=" + acc.email);
                                var newUser = new UserModel(
                                    { 
                                      active: true, 
                                      email: acc.email,
                                      firstName: acc.givenName,
                                      lastName: acc.surname,
                                      sp_api_key_id: apiKey.id,
                                      sp_api_key_secret: apiKey.secret
                                    });
                                newUser.save(function (err, user) {
                                    if (err) {
                                        logger.error("Mongoose error creating new account for " + user.email);
                                        logger.error(err);
                                        res.status(400);
                                        res.json({error: err}); 
                                    } else {
                                        logger.debug("Successfully added User object for " + user.email);
                                        res.status(201);
                                        res.json(user); 
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });

    router.get('/status', function(req, res) {
        logger.debug('Router for GET /status');

        var user = null;
        var errStr = null;
        var includeUnreadIDs = false;
        var resultStatus = null;
        var resultJSON = {};

        var getStatusTasks = [
            function getStatus(cb) {
                models.StatusModel.find({'_id' : 1}, function (err, statusDocs) {
                    if (err) {
                        errStr = 'Error retrieving current status';
                        resultStatus = 400;
                        resultJSON = { error : errStr };
                        logger.debug(errStr);
                        cb(new Error(errStr));
                    }

                    if (statusDocs.length == 0) {
                        logger.debug('Empty status docs ');
                        cb(new Error("Not really an error but we want to shortcircuit the series"));
                    } else {
                        resultJSON = { currentStatus : statusDocs[0] };
                        cb(null);
                    }
                });
            }
        ]

        async.series(getStatusTasks, function finalizer(err, results) {
            if (null == resultStatus) {
                res.status(200);
            } else {
                res.status(resultStatus);
            }
            res.json(resultJSON);
        });
    });
    app.use('/api/v1.0', router);
}
