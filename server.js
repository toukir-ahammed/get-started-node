var express = require("express");
var hbs = require('express-handlebars');
var app = express();
var cfenv = require("cfenv");
var bodyParser = require('body-parser');
const fetch = require('node-fetch');

var baseUrl = "http://103.221.253.163:8080";

app.set('view engine', 'hbs');
app.engine('hbs', hbs({
  extname: 'hbs',
  defaultView: 'default',
  layoutsDir: __dirname + '/views/',
  partialsDir: __dirname + '/views/'
}));

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

let mydb, cloudant;
var vendor; // Because the MongoDB and Cloudant use different API commands, we
// have to check which command should be used based on the database
// vendor.
var dbName = 'mydb';

// Separate functions are provided for inserting/retrieving content from
// MongoDB and Cloudant databases. These functions must be prefixed by a
// value that may be assigned to the 'vendor' variable, such as 'mongodb' or
// 'cloudant' (i.e., 'cloudantInsertOne' and 'mongodbInsertOne')

var insertOne = {};
var getAll = {};

insertOne.cloudant = function (doc, response) {
  mydb.insert(doc, function (err, body, header) {
    if (err) {
      console.log('[mydb.insert] ', err.message);
      response.send("Error");
      return;
    }
    doc._id = body.id;
    response.send(doc);
  });
}

getAll.cloudant = function (response) {
  var names = [];
  mydb.list({ include_docs: true }, function (err, body) {
    if (!err) {
      body.rows.forEach(function (row) {
        if (row.doc.name)
          names.push(row.doc.name);
      });
      response.json(names);
    }
  });
  //return names;
}

let collectionName = 'mycollection'; // MongoDB requires a collection name.

insertOne.mongodb = function (doc, response) {
  mydb.collection(collectionName).insertOne(doc, function (err, body, header) {
    if (err) {
      console.log('[mydb.insertOne] ', err.message);
      response.send("Error");
      return;
    }
    doc._id = body.id;
    response.send(doc);
  });
}

getAll.mongodb = function (response) {
  var names = [];
  mydb.collection(collectionName).find({}, { fields: { _id: 0, count: 0 } }).toArray(function (err, result) {
    if (!err) {
      result.forEach(function (row) {
        names.push(row.name);
      });
      response.json(names);
    }
  });
}

/* Endpoint to greet and add a new visitor to database.
* Send a POST request to localhost:3000/api/visitors with body
* {
*   "name": "Bob"
* }
*/

app.get("/api/test", function (request, response) {
  response.render("dupayment", { layout: 'default' });
});
app.get("/api/payment", async function (request, response) {
  if (request.query && request.query.invoice) {
    var invoice = request.query.invoice
    console.log(invoice);

    await fetch(baseUrl + "/api/external/invoice/" + invoice)
      .then(async function (res) {
        console.log(res);
        var json = await res.json();
        console.log(json);


        if (res && res.status == 200) {
          if (json.status == 'expired' || json.status == 'completed') {
            response.render("error", { layout: 'default', message: "Invoice Expired" });
          } else if (json.status == 'completed') {
            response.render("error", { layout: 'default', message: "Invoice Completed" });
          } else {
            response.render("dupayment", { layout: 'default', invoice: json });
          }

        }
        else {
          response.render("error", { layout: 'default', message: "Wrong Request" });
        }


      });
  } else {
    response.render("error", { layout: 'default', message: "Wrong Request" });
  }


});

app.post("/api/payment/", async function (request, response) {
  console.log(request.body.paymentMethod);

  if (request.body && request.body.invoice && request.body.paymentMethod) {

    var invoice = request.query.invoice
    var paymentMethod = request.body.paymentMethod;
    console.log(invoice);

    await fetch(baseUrl + "/api/external/invoice/" + invoice)
      .then(async function (res) {
        // console.log(res);
        var invoiceJson = await res.json();
        console.log(invoiceJson);


        if (res && res.status == 200) {
          if (invoiceJson.status == 'expired') {
            response.render("error", { layout: 'default', message: "Invoice Expired" });
          } else if (invoiceJson.status == 'completed') {
            response.render("error", { layout: 'default', message: "Invoice Completed" });
          } else {
            if (paymentMethod === "bkash") {
              response.render("bkash", { layout: 'default', invoice: invoiceJson });
            } else if (paymentMethod === "surecash") {
              if (request.body.walletid) {
                var walletid = request.body.walletid;
                console.log("Wallet: ", walletid);

                await fetch(baseUrl + "/api/external/surecash/payment",{
                  method: 'post',
                  body:    JSON.stringify({
                    "merchantInvoiceNumber": invoiceJson.id,
                    "customerMobileNumber": walletid.substring(0, 11),
                    "surecashAccountNo": walletid,
                    "customerId": "",
                    "billNo": invoiceJson.id,
                    "amount": invoiceJson.amount,
                    "note": "Online payment",
                    "Description": "Description goes here",
                    "smsTemplate": "SMSText"
                }),
                  headers: { 'Content-Type': 'application/json' }
                })
                  .then(async function (res) {
                    console.log(res);
                    var json = await res.json();
                    console.log(json);


                    if (res && res.status == 200) {
                      if (json.statusCode == 200) {
                        // response.render("error", { layout: 'default', message: "Payment Completed" });
                        response.writeHead(301,
                          {Location: invoiceJson.redirectUrl}
                        );
                        response.end();
                      } else {
                        response.render("error-surecash", { layout: 'default', message: json.description, retryUrl: "/api/payment?invoice=" + invoiceJson.id });
                      }

                    }
                    else {
                      response.render("error", { layout: 'default', message: "Wrong Request" });
                    }


                  });

              } else {
                response.render("error", { layout: 'default', message: "Wrong Request" });
              }
            } else {
              response.render("error", { layout: 'default', message: "Wrong Request" });
            }

          }

        }
        else {
          response.render("error", { layout: 'default', message: "Wrong Request" });
        }


      });
  } else {
    response.render("error", { layout: 'default', message: "Wrong Request" });
  }
});

app.get("/api/payment/bkash", async function (request, response) {
  if (request.query && request.query.invoice) {
    var invoice = request.query.invoice
    console.log(invoice);

    await fetch(baseUrl + "/api/external/invoice/" + invoice)
      .then(async function (res) {
        console.log(res);
        var json = await res.json();
        console.log(json);


        if (res && res.status == 200) {
          if (json.status == 'expired') {
            response.render("error", { layout: 'default', message: "Invoice Expired" });
          } else if (json.status == 'completed') {
            response.render("error", { layout: 'default', message: "Invoice Completed" });
          } else {
            response.render("bkash", { layout: 'default', invoice: json });
          }

        }
        else {
          response.render("error", { layout: 'default', message: "Wrong Request" });
        }


      });
  } else {
    response.render("error", { layout: 'default', message: "Wrong Request" });
  }
});
//IPN
app.post("/api/ipn", function (request, response) {
  console.log(request);

  response.json({
    message: "listen korechi"
  });
});
app.post("/api/visitors", function (request, response) {
  var userName = request.body.name;
  var doc = { "name": userName };
  if (!mydb) {
    console.log("No database.");
    response.send(doc);
    return;
  }
  insertOne[vendor](doc, response);
});

/**
 * Endpoint to get a JSON array of all the visitors in the database
 * REST API example:
 * <code>
 * GET http://localhost:3000/api/visitors
 * </code>
 *
 * Response:
 * [ "Bob", "Jane" ]
 * @return An array of all the visitor names
 */
app.get("/api/visitors", function (request, response) {
  var names = [];
  if (!mydb) {
    response.json(names);
    return;
  }
  getAll[vendor](response);
});

// load local VCAP configuration  and service credentials
var vcapLocal;
try {
  vcapLocal = require('./vcap-local.json');
  console.log("Loaded local VCAP", vcapLocal);
} catch (e) { }

const appEnvOpts = vcapLocal ? { vcap: vcapLocal } : {}

const appEnv = cfenv.getAppEnv(appEnvOpts);

if (appEnv.services['compose-for-mongodb'] || appEnv.getService(/.*[Mm][Oo][Nn][Gg][Oo].*/)) {
  // Load the MongoDB library.
  var MongoClient = require('mongodb').MongoClient;

  dbName = 'mydb';

  // Initialize database with credentials
  if (appEnv.services['compose-for-mongodb']) {
    MongoClient.connect(appEnv.services['compose-for-mongodb'][0].credentials.uri, null, function (err, db) {
      if (err) {
        console.log(err);
      } else {
        mydb = db.db(dbName);
        console.log("Created database: " + dbName);
      }
    });
  } else {
    // user-provided service with 'mongodb' in its name
    MongoClient.connect(appEnv.getService(/.*[Mm][Oo][Nn][Gg][Oo].*/).credentials.uri, null,
      function (err, db) {
        if (err) {
          console.log(err);
        } else {
          mydb = db.db(dbName);
          console.log("Created database: " + dbName);
        }
      }
    );
  }

  vendor = 'mongodb';
} else if (appEnv.services['cloudantNoSQLDB'] || appEnv.getService(/[Cc][Ll][Oo][Uu][Dd][Aa][Nn][Tt]/)) {
  // Load the Cloudant library.
  var Cloudant = require('@cloudant/cloudant');

  // Initialize database with credentials
  if (appEnv.services['cloudantNoSQLDB']) {
    // CF service named 'cloudantNoSQLDB'
    cloudant = Cloudant(appEnv.services['cloudantNoSQLDB'][0].credentials);
  } else {
    // user-provided service with 'cloudant' in its name
    cloudant = Cloudant(appEnv.getService(/cloudant/).credentials);
  }
} else if (process.env.CLOUDANT_URL) {
  cloudant = Cloudant(process.env.CLOUDANT_URL);
}
if (cloudant) {
  //database name
  dbName = 'mydb';

  // Create a new "mydb" database.
  cloudant.db.create(dbName, function (err, data) {
    if (!err) //err if database doesn't already exists
      console.log("Created database: " + dbName);
  });

  // Specify the database we are going to use (mydb)...
  mydb = cloudant.db.use(dbName);

  vendor = 'cloudant';
}

//serve static file (index.html, images, css)
app.use(express.static(__dirname + '/views'));
//app.use('/scripts', express.static(path.join(__dirname, '/publict/scripts')));



var port = process.env.PORT || 3000
app.listen(port, function () {
  console.log("To view your app, open this link in your browser: http://localhost:" + port);
});
