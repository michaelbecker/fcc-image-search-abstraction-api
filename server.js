/* 
 * Notes on Image search API 
 * https://forum.freecodecamp.org/t/image-search-abstraction-layer-here-are-some-instructions-for-working-with-google-custom-search/115982
 * https://developers.google.com/custom-search/json-api/v1/overview
 */

// init project
const express = require('express');
const mongodb = require("mongodb");
const https = require("https");

var app = express();
const MongoClient = mongodb.MongoClient;

// Pull this from our hidden env file.
const mongoDbUrl = process.env.MLAB_URI;

const NumLastSearchesSaved = 10;

// Build the starting search string.
// To use, append a "&q=SEARCH_STRING
const googleImageSearchBase = "https://www.googleapis.com/customsearch/v1"
                            + "?cx=" + process.env.GOOGLE_SEARCH_ENGINE_ID
                            + "&searchType=image"
                            + "&key=" + process.env.GOOGLE_API_KEY;

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});


//
//  Query everything in the DB and return it.
//
function GetSearchTerms(response) {

  MongoClient.connect(mongoDbUrl, function (err, database) {

    if (err) {
      console.log('Internal error: unable to connect to the mongoDB server. ' + err);
      return;
    }

    // The API Changed between Mongo 2.x and 3.x.
    // Reference: https://stackoverflow.com/questions/43779323/typeerror-db-collection-is-not-a-function
    var db = database.db("fccprojects");

    // do some work here with the collection we are using for this project.
    var collection = db.collection("image-search-abstraction");
  
    collection.find({}).sort({"when": -1}).toArray( function (err, documents) {
      
      if (err) {
        console.log('Internal error: Failed Mongo find. ' + err);
        database.close();
        return;
      }

      var searches = [];
      for (var i = 0; i < documents.length; i++) {
        
        searches.push({ "term": documents[i].term,
                        "when": documents[i].when,});
      }
      
      database.close();

      response.send(JSON.stringify(searches));
    });
  
  });
}


//
//  Delete all but the last "limit" documents in the collection.
//
function PruneSearchTerms(limit) {

  MongoClient.connect(mongoDbUrl, function (err, database) {

    if (err) {
      console.log('Internal error: unable to connect to the mongoDB server. ' + err);
      return;
    }

    // The API Changed between Mongo 2.x and 3.x.
    // Reference: https://stackoverflow.com/questions/43779323/typeerror-db-collection-is-not-a-function
    var db = database.db("fccprojects");

    // do some work here with the collection we are using for this project.
    var collection = db.collection("image-search-abstraction");
  
    collection.find({}).sort({"when": -1}).toArray( function (err, documents) {
      
      if (err) {
        console.log('Internal error: Failed Mongo find. ' + err);
        database.close();
        return;
      }
    
      // Valid shortened URL, redirect.
      for (var i = limit; i < documents.length; i++) {
        collection.remove({"when": documents[i].when});
      }

      database.close();
    });
  
  });
}


//
//  Add "searchTerm" to the DB collection.
//
function SaveSearchTerm(searchTerm) {
  
  MongoClient.connect(mongoDbUrl, function (err, database) {

    if (err) {
      console.log('Internal error: unable to connect to the mongoDB server. ' + err);
      return;
    }

    // The API Changed between Mongo 2.x and 3.x.
    // Reference: https://stackoverflow.com/questions/43779323/typeerror-db-collection-is-not-a-function
    var db = database.db("fccprojects");

    // do some work here with the collection we are using for this project.
    var collection = db.collection("image-search-abstraction");

    // For MongoDB, we want to use the actual Date object.
    var now = new Date();
    
    var document = {
      "term": searchTerm,
      //"when": now.toUTCString()
      "when": now
    };
    
    collection.insert(document, function (err, data) {
      if (err) {
        console.log('Internal error: Insert Failed. ' + err);
        database.close();
        return;
      }
      database.close();
    });
    
  }); //MongoClient.connect()

};


//
//  Provide a route for the image search functionality.
//
app.get("/api/imagesearch/:SEARCH_QUERY", function (request, response) {
  
  // References:  
  // https://nodejs.org/api/http.html#http_http_request_options_callback
  // https://stackoverflow.com/questions/5643321/how-to-make-remote-rest-call-inside-node-js-any-curl
  
  var searchUrl = googleImageSearchBase + "&q=" + request.params.SEARCH_QUERY;
  
  if (request.query.hasOwnProperty("offset")) {
    var offset = parseInt(request.query.offset);
    if (!isNaN(offset) && offset >=1 ) {
      searchUrl += "?start=" + offset;
    }
  }
  
  //  Save the term(s) in the DB and limit the size of the collection.
  SaveSearchTerm(request.params.SEARCH_QUERY);
  PruneSearchTerms(NumLastSearchesSaved);
  
  https.get(searchUrl, (googleResponse) => {

    var data = "";
    
    googleResponse.on('data', (chunk) => {
      data += chunk;
    });
  
    googleResponse.on('end', () => {

      var fullSearch = JSON.parse(data);
      
      var searchReply = [];
      
      for (var i = 0; i < fullSearch.items.length; i++) {

        searchReply.push({
          "url": fullSearch.items[i].link,
          "snippet": fullSearch.items[i].snippet,
          "thumbnail": fullSearch.items[i].image.thumbnailLink,
          "context": fullSearch.items[i].image.contextLink,
          });
      }
      
      response.send(JSON.stringify(searchReply));
    }); // googleResponse.on('end')
  }); // https.get()
  
});

//
//  Provide a route for getting the last terms searched for.
//
app.get("/api/latest/imagesearch", function (request, response) {

  GetSearchTerms(response);

});


// 
//  listen for requests :)
//
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});

