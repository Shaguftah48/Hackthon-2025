var AWS = require('aws-sdk');
var http = require('http');   
const { v4: uuidv4 } = require('uuid');uuidv4();

AWS.config.region = 'us-east-1';
var sns = new AWS.SNS();
var s3 = new AWS.S3();
var rekognition = new AWS.Rekognition({apiVersion: '2016-06-27'});
var docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {
    
    // Configuration - Start
    var srcBucket = 'detect-face-ad';
    var managerPhoneNumber = "+19999999999";
    var table = "demographic";
    // Configuration - End
 
    var srcKey = decodeURIComponent(event.filename.replace(/\+/g, " "));
    var params = {
      Image: {
         S3Object: {
            Bucket: srcBucket, 
            Name: srcKey
         }
      }, 
      Attributes: ["ALL"]
    };
    
    rekognition.detectFaces(params, function(err, result) {
        if (err) {
            console.log(err, err.stack);
            callback('could not detect faces');
            return;
        } else { 
            if (result !== null) {
                console.log(JSON.stringify(result));
                // Generate a UUID number correctly
                var id = uuidv4(); 
                var paramsDB = {
                    TableName: table,
                    Item: {
                        "id": id,
                        "info": result // raw response from detectFaces call
                    }
                };
                // Save detectFaces response to database for future analytics reporting
                docClient.put(paramsDB, function(err, rs) {
                    if (err) {
                        console.log(err, err.stack);
                        callback('could not add to db');
                        return;
                    } else {
                        if (result.FaceDetails !== null && result.FaceDetails.length > 0) { 
                            var item = result.FaceDetails[0];
                            if (item !== null && item.Confidence >= 80) {
                                // Additional processing logic...
                                // Example for sending an SNS text message after URL shortening
                                var url  = 'http://tinyurl.com/api-create.php?url=https://s3.amazonaws.com/' + srcBucket + '/' + srcKey;
                                http.get(url, function(res) {
                                    var body = '';
                                    res.on('data', function(data) {
                                        body += data;
                                    });
                                    res.on('end', function() {
                                        var shortenedurl = body;
                                        var paramsmessage = {
                                            Message: 'customer: ' + item.Emotions[0].Type.toLowerCase() + ', gender: ' + item.Gender.Value.toLowerCase() + ', age range: ' + item.AgeRange.Low  + '-' + item.AgeRange.High + ',' + ' picture: ' + shortenedurl,
                                            MessageStructure: 'string',
                                            PhoneNumber: managerPhoneNumber
                                        };
                                        sns.publish(paramsmessage, function(err, data) {
                                            if (err) {
                                                console.log(err, err.stack);
                                                callback('could not send text');
                                                return;
                                            } else  {
                                                callback(null, 'yogadvd.jpg');
                                                return;
                                            }      
                                        });    
                                    });
                                }).on('error', function(e) {
                                    callback('error occurred');
                                    return;
                                });
                            } else {
                                // Additional fallbacks (kid, gender-based ads, etc.)
                                // ...
                                callback(null, 'tv.jpg');
                                return;
                            }
                        }
                    }
                });        
            }
        }
    });
};
