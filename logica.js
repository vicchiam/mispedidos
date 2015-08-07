var fs = require('fs');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var request = require('request');
var sqlite3=require("sqlite3").verbose();

var SCOPES = ['https://www.googleapis.com/auth/drive'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'drive-api-quickstart.json';
var PARENT_FOLDER_ID="0BxmjFM_vQC_6fmQ0aXY5TGd5NGRxOE1qQnBrMmtuSWxBMlFsSEJEZUQ1MzlOWnVkUHdSSUk";

var FILE_DB="mispedidos.db";

exports.inicio=function inicio(req,res){
    if(!fs.existsSync(FILE_DB)){
    	var db=new sqlite3.Database(FILE_DB);
    	var SQL="CREATE TABLE ARCHIVOS(id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT UNIQUE, fecha TEXT, id_drive TEXT)";
    	db.run(SQL);
    	console.log("Database Created");
    	db.close();
    }
    if(fs.existsSync(TOKEN_PATH)){
        var auth=true;
    }
    else{
        var auth=false;
    }
    res.render("index.ejs",{title:"Mis Pedidos",driveAuth:auth});
}

exports.driveAutentificacion=function driveAutentificacion(req,res){
    oauth2Client=getOauth2Client();
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    res.statusCode = 302;
    res.setHeader("Location", authUrl);
    res.end();
}

exports.driveGuardarAutentificacion=function driveGuardarAutentificacion(req,res){
    var code=req.query.code;
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

exports.gestionFicheros=function gestionFicheros(req, res){
    //Archivos que estan en el directorio
    var archivos_dir=fs.readdirSync("./files");
    //Archivos para eliminar de BD
    var eliminar_db=[];
    //Archivos que estan en el DIR y en BD
    var archivos_both=[];

    var db=new sqlite3.Database(FILE_DB);
	var SQL="SELECT * FROM ARCHIVOS";
	db.all(SQL,function(err,rows){
		if(err){
			console.log("ERR "+err);
		}
        console.log(archivos_dir);
        for(var i=0;i<rows.length;i++){
            var row=rows[i];
            console.log(row.nombre+" "+archivos_dir.indexOf(row.nombre));
            if(archivos_dir.indexOf(row.nombre)<0){
                //Esta en BD pero no en directorio -> Marcado para eliminar de BD
                eliminar_db.push(row.id);
            }
            else{
                //Esta en BD y en Directorio
                var archivo=new Object();
    			archivo.id=row.id;
    			archivo.nombre=row.nombre;
    			archivo.tick=row.tick;
    			archivo.fecha=row.fecha;
    			archivo.id_drive=row.id_drive;
    			archivos_both.push(archivo);
                archivos_dir[archivos_dir.indexOf(row.nombre)]=null;
            }
		}
        //Eliminamos los borrados
        for(var j=0;j<eliminar_db.length;j++){
            var SQL="DELETE FROM ARCHIVOS WHERE id=?";
        	db.run(SQL,eliminar_db[j]);
        }

        //Insertamos los nuevo archivos
        for(var j=0;j<archivos_dir.length;j++){
            if(archivos_dir[j]!=null){
                var SQL="INSERT INTO ARCHIVOS (nombre,fecha,id_drive) VALUES(?,CURRENT_TIMESTAMP,0)";
            	db.run(SQL,archivos_dir[j]);
            }
        }
        db.close();
        listar(res);
    });
}

function getOauth2Client(){
    var content=fs.readFileSync('client_secret.json');
    var json=JSON.parse(content);
    var clientId=json.web.client_id;
    var clientSecret=json.web.client_secret;
    var redirectUrl=json.web.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    return oauth2Client;
}

function listar(res){
    listarDirectorio(res);
}

function listarDirectorio(res){
    var db=new sqlite3.Database(FILE_DB);
	var SQL="SELECT * FROM ARCHIVOS";
	db.all(SQL,function(err,rows){
		if(err){
			console.log("ERR "+err);
		}
        var directorio=[];
        for(var i=0;i<rows.length;i++){
            var row=rows[i];
            var archivo=new Object();
			archivo.id=row.id;
			archivo.title=row.nombre;
			archivo.modifiedDate=row.fecha;
			archivo.id_drive=row.id_drive;
			directorio.push(archivo);
        }
		db.close();
        listarDrive(res,directorio)
    });
}

function listarDrive(res,directorio) {
    var oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH);
    oauth2Client.credentials = JSON.parse(token);
    var items=[];
    var gDrive = google.drive('v2');
    gDrive.files.list(
        {
            auth: oauth2Client,
            q: '"' + PARENT_FOLDER_ID + '" in parents'
        },
        function(err2, response) {
            if (err2) {
                console.log('The API returned an error: ' + err2);
                return;
            }
            drive = response.items;
            res.render("gestion.ejs",{title:"Gestion Archivos",directorio:directorio,drive:drive});
        }
    );
}


function driveInsertar(file){
    var oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH);
    oauth2Client.credentials = JSON.parse(token);

    var fstatus = fs.statSync(file);
    fs.open(file, 'r', function(status, fileDescripter) {

        var buffer = new Buffer(fstatus.size);
        fs.read(fileDescripter, buffer, 0, fstatus.size, 0, function(err, num) {
            console.log("REQUEST.POST");
            request.post({
                'url': 'https://www.googleapis.com/upload/drive/v2/files',
                'qs': {
                    //request module adds "boundary" and "Content-Length" automatically.
                    'uploadType': 'multipart'
                },
                'headers' : {
                    'Authorization': 'Bearer '+ oauth2Client.credentials.access_token
                },
                'multipart':  [
                    {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'body': JSON.stringify({
                            'title': file,
                            'parents': [
                                {
                                    'id': PARENT_FOLDER_ID
                                }
                            ]
                        })
                    },
                    {
                        'Content-Type': 'text/csv',
                        'body': buffer
                    }
                ]
            },
            function (error, response, body){
                console.log(body);
            });
        });

        console.log("FIN");

    });
}
