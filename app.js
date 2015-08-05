var express=require("express");
var path = require('path');

var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

var open=require("open");
var bodyParser = require('body-parser');
var partials= require("express-partials")

var SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'drive-api-quickstart.json';

var app=express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

var port=8080;

app.set('views', path.join(__dirname, 'public'));
app.set('views engine', 'ejs');
app.use(partials());

//CORS
app.use(function(req, res, next) {
	res.header('Access-Control-Allow-Origin', "*");
	res.header('Access-Control-Allow-Methods', 'OPTIONS,GET,PUT,POST,DELETE');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	if (req.method == 'OPTIONS') {
		res.status(200).send();
	}
	else {
		next();
	}
});

app.get("/",function(req,res){
    if(fs.existsSync(TOKEN_PATH)){
        listFiles(res);
    }
    else{
        res.render("index.ejs",{title:"Mis Pedidos",driveAuth:false,items:[]});
    }
});

app.get("/driveAuth",driveAuthFunction);

app.post("/driveAuthCode",driveAuthStore);

app.get("/reload",function(req,res){

});

app.listen(port);

//Funciones

function driveAuthFunction(req,res){
    oauth2Client=getOauth2Client();
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    open(authUrl);
    res.render("driveAuth.ejs",{title:"Pegar código"});
}

function driveAuthStore(req,res){
    var code=req.body.code;
    oauth2Client.getToken(code, function(err, token) {
        oauth2Client.credentials = token;
        try {
          fs.mkdirSync(TOKEN_DIR);
        } catch (err) {
          if (err.code != 'EEXIST') {
            throw err;
          }
        }
        fs.writeFile(TOKEN_PATH, JSON.stringify(token));
        console.log('Token stored to ' + TOKEN_PATH);
        res.render("guardado.ejs",{title:"Guardado"});
    });
}

function getOauth2Client(){
    var content=fs.readFileSync('client_secret.json');
    var credentials=JSON.parse(content);
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    return oauth2Client;
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listFiles(res) {
    oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH);
    oauth2Client.credentials = JSON.parse(token);
    var items=[];
    var service = google.drive('v2');
    service.files.list(
        {
            auth: oauth2Client,
            maxResults: 10,
        },
        function(err2, response) {
            if (err2) {
                console.log('The API returned an error: ' + err2);
                return;
            }
            items = response.items;
            //console.log(items);
            res.render("index.ejs",{title:"Mis Pedidos",driveAuth:true,items:items});
        }
    );
}
