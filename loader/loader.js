var request = require('request');
var moment = require('moment');
var mongoose = require('mongoose');
var fs = require('fs');

var BASE_URL = 'http://forecast.weather.gov/MapClick.php?';
mongoose.connect('mongodb://localhost/nycstatus_test');

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

var weatherForecastSchema = new mongoose.Schema({
    periodName : { type: String, trim: true},
    temp : { type: Number },
    iconLink : { type: String, trim: true},
    shortDescription : { type: String, trim: true},
    longDescription : { type: String, trim: true},
    hazard : { type: String, trim: true},
    hazardUrl : { type: String, trim: true}
},
{ _id : true }
);

var weatherStatusSchema = new mongoose.Schema({
    borough : { type: String, trim: true},
    current : {
        temp : { type: String, trim: true},
        winds : { type: String, trim: true},
        description : { type: String, trim: true},
        image : { type: String, trim: true}
    },
    forecast : [weatherForecastSchema], 
    lastUpdated : { type: Date, default: Date.now }
},
{ _id : true }
);

var statusSchema = new mongoose.Schema({
    _id : { type: Number },
    weatherStatus : [weatherStatusSchema]
},
{ collection: 'status' }
);

var StatusModel = mongoose.model( 'Status', statusSchema );

var now = new Date();
var newStatus = {_id : 1, weatherStatus : []};

BOROUGHS.forEach(function getWeather(borough, index, array) {
    var url = BASE_URL + 
              'lat='+borough.latitude + 
              '&lon='+borough.longitude +
              '&FcstType=json';
    // We have to fill out the User-Agent or we get denied
    var options = {'url' : url, headers : {'User-Agent' : 'Mozilla/5.0'}};

    //request(options, function (err, response, body) {
    if (true) {
//        if (err) {
//            throw new Error("Error with weather.gov lookup: " + err.toString());
//        }

        console.log('Borough=%s url=%s', borough.name, url);
        //if (response.statusCode == 200) {
        if (true) {
            var body = fs.readFileSync(borough.name + '.json', {encoding : 'utf8'});
            var res = JSON.parse(body);
            weather = {
                'borough' : borough.name,
                'current' : { 
                    'temp' : res.currentobservation.Temp,
                    'winds' : res.currentobservation.Winds,
                    'description' : res.currentobservation.Weather,
                    'image' : res.currentobservation.Weatherimage},
                'forecast' : [],
                'lastUpdated' : new Date()
            };
            console.log('res.time.startValidTime[0]: %s', res.time.startValidTime[0]);
            var firstDate = moment(res.time.startValidTime[0]);            
            var stopDate = firstDate.add(1, 'days');

            console.log("firstDate: %s", firstDate.toString());
            console.log("stopDate: %s", stopDate.toString());

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
                forecast = {
                    'periodName' : res.time.startPeriodName[ndx],
                    'tempLabel' : res.time.tempLabel[ndx],
                    'temp' : res.data.temperature[ndx],
                    'iconLink' : res.data.iconLink[ndx],
                    'shortDescription' : res.data.weather[ndx],
                    'longDescription' : res.data.text[ndx],
                    'hazard' : res.data.hazard[ndx],
                    'hazardUrl' : res.data.hazardUrl[ndx]
                };
//                if (res.data.hazard[ndx]) {
//                    forecast.hazard = res.data.hazard[ndx];
//                }
//                if (res.data.hazardUrl[ndx]) {
//                    forecast.hazardUrl = res.data.hazardUrl[ndx];
//                }
                weather.forecast.push(forecast);
            }
            newStatus.weatherStatus.push(weather);
        } else {
            console.log("ERROR: Received statusCode %d for borough %s",
                        response.statusCode, boroughname);
        }
    //});
    }
});

console.log("%j", newStatus);
StatusModel.where({ '_id' : 1 }).update({'$set' : {'weatherStatus' : newStatus.weatherStatus}}, function (err, numberAffected, raw) {
    if (err) {
        var errStr = 'ERROR: Failed to update status: ' + err.toString();
        console.log(errStr);
    }
    process.exit(code=0);
});

