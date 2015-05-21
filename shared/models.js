"use strict";

module.exports = function(mongoose) {
    var weatherForecastSchema = new mongoose.Schema({
        periodName : { type: String, trim: true},
        temp : { type: Number },
        iconLink : { type: String, trim: true},
        shortDescription : { type: String, trim: true},
        longDescription : { type: String, trim: true},
        hazard : { type: String, trim: true},
        hazardUrl : { type: String, trim: true}
    },
    { _id : false }
    );

    var boroughWeatherStatusSchema = new mongoose.Schema({
        borough : { type: String, trim: true},
        current : {
            temp : { type: String, trim: true},
            winds : { type: String, trim: true},
            description : { type: String, trim: true},
            image : { type: String, trim: true}
        },
        forecast : [weatherForecastSchema], 
    },
    { _id : false }
    );

    var uberProductSchema = new mongoose.Schema({
        name : { type: String, trim: true},
        surgeMultiplier : { type: Number }
    },
    { _id : false }
    );

    var boroughUberStatusSchema = new mongoose.Schema({
        borough : { type: String, trim: true},
        products : [uberProductSchema]
    },
    { _id : false }
    );

    var mtaServiceStatusSchema = new mongoose.Schema({
        line : { type: String, trim: true},
        status : { type: String, trim: true},
        text : { type: String, trim: true},
        date : { type: String, trim: true},
        time : { type: String, trim: true},
    },
    { _id : false }
    );

    var statusSchema = new mongoose.Schema({
        _id : { type: Number },
        weatherStatus : { 
            lastUpdated : { type: Date, default: Date.now },
            boroughs : [boroughWeatherStatusSchema]
        },
        uberStatus : {
            lastUpdated : { type: Date, default: Date.now },
            boroughs : [boroughUberStatusSchema]
        },
        mtaStatus : {
            lastUpdated : { type: Date, default: Date.now },
            service : [mtaServiceStatusSchema]
        }
    },
    { collection: 'status' }
    );

    var models = {
        StatusModel : mongoose.model('Status', statusSchema),
    };
    return models;
}


