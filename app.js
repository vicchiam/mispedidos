var express=require("express");
var path = require('path');
var bodyParser = require('body-parser');
var partials= require("express-partials");
var logica = require('./logica');

var app=express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var port=8080;

app.set('views', path.join(__dirname, 'public'));
app.set('views engine', 'ejs');
app.use(partials());
app.use(express.static(path.join(__dirname, 'public')));

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

/*app.get("/",function(req,res){
	mensajes=["Archivo XXXXXXXX ACTUALIZADO","Archivo XXXXXXXX ACTUALIZADO","Archivo XXXXXXXX ACTUALIZADO","Archivo XXXXXXXX ACTUALIZADO"]
	res.render("sincronizar.ejs",{title:"Sincronizar Archivos",mensajes:mensajes});
});*/

app.get("/",logica.inicio);

app.get("/driveAuth",logica.driveAutentificacion);

app.get("/oauth2callback",logica.driveGuardarAutentificacion);

app.get("/dboxAuth",logica.dboxAutentificacion);

app.get("/oauthcallback_drop",logica.dboxGuardarAutentificacion);

app.get("/gestionFicheros",logica.gestionFicheros);

app.get("/sincronizarDrive",logica.sincronizarDrive);

app.listen(port);
