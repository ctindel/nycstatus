"use strict";
var request = require('request');
var moment = require('moment');
var mongoose = require('mongoose');
var fs = require('fs');
var async = require('async');
var db = require('./config/db');
var security = require('./config/security');
var uber = require('uber-api')({server_token : security.uberServerToken});
var S = require('string');
var cheerio = require('cheerio');
var prevoty = require('prevoty').client({ key: security.prevotyApiKey });
var models = require('../shared/models')(mongoose);

mongoose.connect(db.url);
mongoose.set('debug', true);

var BOROUGHS = [ { 'name' : 'Manhattan', 
                   'zip' : '10003', 
                   'latitude' : 40.7198,
                   'longitude' : -73.993 }, 
                 { 'name' : 'Queens', 
                   'zip' : '11372', 
                   'latitude' : '40.7514',
                   'longitude' : '-73.8838' },
                 { 'name' : 'Brooklyn', 
                   'zip' : '11216', 
                   'latitude' : '40.6498',
                   'longitude' : '-73.9488' },
                 { 'name' : 'Bronx', 
                   'zip' : '10451', 
                   'latitude' : '40.8489',
                   'longitude' : '-73.8762' },
                 { 'name' : 'Staten Island', 
                   'zip' : '10301', 
                   'latitude' : '40.5866',
                   'longitude' : '-74.1489' }];

var WEATHER_POLLING_INTERVAL_MINS = 60;
var UBER_POLLING_INTERVAL_MINS = 3;
var MTA_POLLING_INTERVAL_MINS = 5;

var WEATHER_API_BASE_URL = 'http://forecast.weather.gov/MapClick.php?';
var UBER_API_BASE_URL = 'https://api.uber.com/v1/products';
var MTA_API_BASE_URL = 'http://web.mta.info/status/serviceStatus.txt';

var now = moment();
var currentStatus = null;

var newWeatherStatus = {lastUpdated : new Date(), boroughs : []};
var newUberStatus = {lastUpdated : new Date(), boroughs : []};
var newMTAStatus = {lastUpdated : new Date(), service : []};

function errExit(str) {
    console.log("ERROR: " + str);
    process.exit(code=1);
}

function verifyPrevoty() {
    return function(next) {
        prevoty.verify(function(err, verified) {
            if (!verified) {
                return next(err);
            }
            return next();
        });
    }
}

function getCurrentStatus() {
    return function(next) {
        models.StatusModel.find({'_id' : 1}, function (err, results) {
            if (err) {
                errExit("Problem retrieving current status: " + err.toString());
            }
            currentStatus = results[0]; 
            return next();
        });
    }
}

// Information about the weather.gov API here:
// http://graphical.weather.gov/xml/
function retrieveWeatherStatus() {
    return function(next) {
        var numBoroughsProcessed = 0;
 
        BOROUGHS.forEach(function getWeather(borough, bNdx, array) {
            var url = WEATHER_API_BASE_URL + 
                      'lat='+borough.latitude + 
                      '&lon='+borough.longitude +
                      '&FcstType=json';
            // We have to fill out the User-Agent or we get denied
            var options = {'url' : url, headers : {'User-Agent' : 'Mozilla/5.0'}};

            request(options, function (err, response, body) {
                numBoroughsProcessed++;
                console.log('Borough=%s url=%s', borough.name, url);

                if (err) {
                    return next(err);
                }

                if (response.statusCode != 200) {
                    return next(new Error(url + 
                                          ' returned statusCode ' + 
                                          response.statusCode));
                }

                var res = JSON.parse(body);
                var weather = {
                    'borough' : borough.name,
                    'current' : { 
                        'temp' : res.currentobservation.Temp,
                        'winds' : res.currentobservation.Winds,
                        'description' : res.currentobservation.Weather,
                        'image' : res.currentobservation.Weatherimage},
                    'forecast' : [],
                };
                var firstDate = moment(res.time.startValidTime[0]);            
                var stopDate = firstDate.add(1, 'days');

                var date;
                var ndx = 0;

                // There can be at most 8 6-hour increments for today and tomorrow
                // So we'll make sure we don't go past the 9th element
                for (ndx = 0; ndx < 9; ndx++) {
                    date = moment(res.time.startValidTime[ndx]);
                    console.log("date: %s", date.toString());
                    if (date.isAfter(stopDate)) {
                        break;
                    }
                    var forecast = {
                        'periodName' : res.time.startPeriodName[ndx],
                        'tempLabel' : res.time.tempLabel[ndx],
                        'temp' : res.data.temperature[ndx],
                        'iconLink' : res.data.iconLink[ndx],
                        'shortDescription' : res.data.weather[ndx],
                        'longDescription' : res.data.text[ndx],
                        'hazard' : res.data.hazard[ndx],
                        'hazardUrl' : res.data.hazardUrl[ndx]
                    };
                    if (res.data.hazard[ndx]) {
                        forecast.hazard = res.data.hazard[ndx];
                    }
                    if (res.data.hazardUrl[ndx]) {
                        forecast.hazardUrl = res.data.hazardUrl[ndx];
                    }
                    weather.forecast.push(forecast);
                }
                newWeatherStatus.boroughs[bNdx] = weather;
                if (numBoroughsProcessed == BOROUGHS.length) {
                    console.log("All boroughs' weather processed successfully");
                    return next();
                }
            });
        });
    }
}

function saveWeatherStatus() {
    return function(next) {
        models.StatusModel.where({ '_id' : 1 }).update({'$set' : {'weatherStatus' : newWeatherStatus}}, function (err, numberAffected, raw) {
            if (err) {
                next(err);
            }
            next();
        });
    }
}

function loadWeatherStatus() {
    return function(next) {
        var lastUpdated = moment(currentStatus.weatherStatus.lastUpdated);
        var weatherArray = []

        if (lastUpdated.add(WEATHER_POLLING_INTERVAL_MINS, 'minutes').isBefore(now)) {
            console.log("Time to lookup weather status again");
        } else {
            console.log("Not yet time to lookup weather status again");
            return next();
        }

        BOROUGHS.forEach(function getWeather(borough, index, array) {
            newWeatherStatus.boroughs.push({});
        });

        weatherArray.push(retrieveWeatherStatus());
        weatherArray.push(saveWeatherStatus());

        async.series(weatherArray, function(err, results){
            if (err) {
                return next(err);
            }
            return next();
        });
    }
}

// Information about the Uber API here:
// https://developer.uber.com/v1/tutorials/
function retrieveUberStatus() {
    return function(next) {
        var numBoroughsProcessed = 0;
 
        BOROUGHS.forEach(function getSurge(borough, bNdx, array) {
            // We have to fill out the User-Agent or we get denied
            var params = {
                sLat : borough.latitude,
                eLat : borough.latitude,
                sLng : borough.longitude,
                eLng : borough.longitude,
            };
            uber.getPriceEstimate(params, function(err, response) {
//            var params = {
//                lat : borough.latitude,
//                lng : borough.longitude,
//            };
//            uber.getProducts(params, function(err, response) {
                numBoroughsProcessed++;
                if (err) {
                    console.log(err);
                    return next(err);
                } else {
                    //console.log("%j", response);
                    response.prices.forEach(function processProduct(prod) {
                        var product = { name : prod.display_name,
                                        surgeMultiplier : prod.surge_multiplier };
                        newUberStatus.boroughs[bNdx].products.push(product);
                    });
                    if (numBoroughsProcessed == BOROUGHS.length) {
                        console.log("All boroughs' Uber processed successfully");
                        return next();
                    }
                }
            });
        });
    }
}

function saveUberStatus() {
    return function(next) {
        models.StatusModel.where({ '_id' : 1 }).update({'$set' : {'uberStatus' : newUberStatus}}, function (err, numberAffected, raw) {
            if (err) {
                next(err);
            }
            next();
        });
    }
}

function loadUberStatus() {
    return function(next) {
        var lastUpdated = moment(currentStatus.uberStatus.lastUpdated);
        var uberArray = [];

        if (lastUpdated.add(UBER_POLLING_INTERVAL_MINS, 'minutes').isBefore(now)) {
            console.log("Time to lookup Uber status again");
        } else {
            console.log("Not yet time to lookup Uber status again");
            return next();
        }

        BOROUGHS.forEach(function getWeather(borough, index, array) {
            newUberStatus.boroughs.push({borough : borough.name,
                                         products : []});
        });

        uberArray.push(retrieveUberStatus());
        uberArray.push(saveUberStatus());

        async.series(uberArray, function(err, results){
            if (err) {
                return next(err);
            }
            return next();
        });
    }
}

function sanitizeText(serviceArray, mtaStatus, dirtyText) {
    return function(next) {
        prevoty.filterContent(dirtyText,
                              security.prevotyContentKey,
                              function(err, filtered) {
            if (err) { 
                return next(err);
            }
            mtaStatus.text = filtered.output; 
            serviceArray.push(mtaStatus);
            return next();
        });
    }
}

function retrieveMTAStatus() {
    return function(next) {
        var prevotyTasks = [];
        var serviceArray = [];
        //var body = fs.readFileSync('serviceStatus.txt', {encoding : 'utf8'});

        var options = { 'url' : MTA_API_BASE_URL, 
                        headers : {'User-Agent' : 'Mozilla/5.0'}};

        request(options, function (err, response, body) {
            if (err) {
                return next(err);
            }

            if (response.statusCode != 200) {
                return next(new Error(MTA_API_BASE_URL + 
                                      ' returned statusCode ' + 
                                      response.statusCode));
            }

            // Because there are things like &amp;nbsp; we need to clean those up
            // before doing the HTML Decode, so we just do the same thing twice.
            var decodedBody = S(body).decodeHTMLEntities().s;
            decodedBody = S(decodedBody).decodeHTMLEntities().s;
            
            var $ = cheerio.load(decodedBody,
                                 { normalizeWhitespace: true,
                                   lowerCaseTags : false,
                                   lowerCaseAttributeNames : false,
                                   xmlMode: true,
                                   decodeEntities : false});

            $('line').each(function(i, elem) {
                var line = $(this);
                var dirtyText = line.children('text').text();
                var mtaStatus = {
                    line : line.children('name').text(),
                    status : line.children('status').text(),
                    date : line.children('date').text(),
                    time : line.children('time').text(),
                };
                prevotyTasks.push(sanitizeText(serviceArray, mtaStatus, dirtyText));
            });

            async.series(prevotyTasks, function(err, results) {
                if (err) {
                    return next(err);
                }
                newMTAStatus.lastUpdated = now;
                newMTAStatus.service = serviceArray;
                return next();
            });
        });
    }
}

function saveMTAStatus() {
    return function(next) {
        models.StatusModel.where({ '_id' : 1 }).update({'$set' : {'mtaStatus' : newMTAStatus}}, function (err, numberAffected, raw) {
            if (err) {
                next(err);
            }
            next();
        });
    }
}

function loadMTAStatus() {
    return function(next) {
        var lastUpdated = moment(currentStatus.mtaStatus.lastUpdated);
        var mtaArray = [];

        if (lastUpdated.add(MTA_POLLING_INTERVAL_MINS, 'minutes').isBefore(now)) {
            console.log("Time to lookup MTA status again");
        } else {
            console.log("Not yet time to lookup MTA status again");
            return next();
        }

        mtaArray.push(retrieveMTAStatus());
        mtaArray.push(saveMTAStatus());

        async.series(mtaArray, function(err, results){
            if (err) {
                return next(err);
            }
            return next();
        });
    }
}

var loaderArray = [];

loaderArray.push(verifyPrevoty());
loaderArray.push(getCurrentStatus());
loaderArray.push(loadWeatherStatus());
loaderArray.push(loadUberStatus());
loaderArray.push(loadMTAStatus());

async.series(loaderArray, function(err, results){
    if (err) {
        console.log("ERROR: " + err.toString());
        process.exit(1);
    }
    process.exit(0);
});
