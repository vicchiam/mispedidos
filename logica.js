var fs = require('fs');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
//var dropbox = require("dbox");
var request = require('request');
var sqlite3 = require("sqlite3").verbose();

var util = require("util");

var URI_DRIVE = ['https://www.googleapis.com/auth/drive'];
var URI_DBOX = ["https://www.dropbox.com/1/oauth2/authorize","https://api.dropbox.com/1/oauth2/token"];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH_DRIVE = TOKEN_DIR + 'drive-api.json';
var TOKEN_PATH_DBOX= TOKEN_DIR + "dbox-api.json";
var DRIVE_PARENT_FOLDER_ID="0BxmjFM_vQC_6fmQ0aXY5TGd5NGRxOE1qQnBrMmtuSWxBMlFsSEJEZUQ1MzlOWnVkUHdSSUk";
var DBOX_PARENT_FOLDER="Compartida";

var FILE_DB="mispedidos.db";
var FILES_DIR="./files";

var global_dir=[];
var global_drive=[];
var global_authDrive=false;
var global_authDbox=false;

exports.inicio=function inicio(req,res){
    if(!fs.existsSync(FILE_DB)){
    	var db=new sqlite3.Database(FILE_DB);
    	var SQL="CREATE TABLE ARCHIVOS(id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT UNIQUE, fecha TEXT)";
    	db.run(SQL);
    	console.log("Database Created");
    	db.close();
    }
    if(fs.existsSync(TOKEN_PATH_DRIVE)){
        global_authDrive=true;
    }
    if(fs.existsSync(TOKEN_PATH_DBOX)){
        global_authDbox=true;
    }
    res.render("index.ejs",{title:"Mis Pedidos",driveAuth:global_authDrive,dboxAuth:global_authDbox});
}

/***AUTENTIFICACION DRIVE*************************************************************/

exports.driveAutentificacion=function driveAutentificacion(req,res){
    oauth2Client=getOauth2Client();
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: URI_DRIVE
    });
    //res.statusCode = 302;
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
        fs.writeFile(TOKEN_PATH_DRIVE, JSON.stringify(token));
        console.log('Token stored to ' + TOKEN_PATH_DRIVE);
        global_authDrive=true;
        res.render("guardado.ejs",{title:"Acceso a drive"});
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

/**AUTENTIFACION DROPBOX*****************************************************/

exports.dboxAutentificacion=function dboxAutentificacion(req,res){
    var dboxAuth=getOauth2ClientDbox();
    var authUrl=URI_DBOX[0]+"?client_id="+dboxAuth.app_key+"&response_type=code&redirect_uri="+dboxAuth.redirect_uri;
    res.statusCode = 302;
    res.setHeader("Location", authUrl);
    res.end();
};

exports.dboxGuardarAutentificacion=function dboxGuardarAutentificacion(req,res){
    var dboxAuth=getOauth2ClientDbox();
    var code=req.query.code;
    console.log(code);
    request.post('https://api.dropbox.com/1/oauth2/token', {
        form: {
            code: code,
            grant_type: 'authorization_code',
            client_id : dboxAuth.app_key,
            client_secret: dboxAuth.app_secret,
            redirect_uri: dboxAuth.redirect_uri
        }
    }, function (error, response, body) {
        var data = JSON.parse(body);

        try {
          fs.mkdirSync(TOKEN_DIR);
        } catch (err) {
          if (err.code != 'EEXIST') {
            throw err;
          }
        }
        fs.writeFile(TOKEN_PATH_DBOX, JSON.stringify(data));
        global_authDbox=true;
        res.render("guardado.ejs",{title:"Acceso a dropbox"});

        /*req.session.token=data.access_token;
        request.post('https://api.dropbox.com/1/account/info', {
            headers: { Authorization: 'Bearer ' + token }
        }, function (error, response, body) {
            res.send('Logged in successfully as ' + JSON.parse(body).display_name + '.');
        });*/

    });

}

function getOauth2ClientDbox(){
    var content=fs.readFileSync('client_secret_drop.json');
    var json=JSON.parse(content);
    var dboxAuth=new Object();
    console.log(json.web.app_key);
    dboxAuth.app_key=json.web.app_key;
    dboxAuth.app_secret=json.web.app_secret;
    dboxAuth.redirect_uri=json.web.redirect_uri;
    return dboxAuth;
}

/**GESTION FICHEROS******************************************/

exports.gestionFicheros=function gestionFicheros(req, res){
    obtenerArchivosBD(res,sincronizarDirectorioBD);
}

function obtenerArchivosBD(res,callback){
    var db=new sqlite3.Database(FILE_DB);
	var SQL="SELECT * FROM ARCHIVOS";
    db.all(SQL,function(err,rows){
        callback(res,rows);
        db.close();
    });
}

function sincronizarDirectorioBD(res,archivos_bd){
    //Archivos que estan en el directorio
    var archivos_dir=fs.readdirSync(FILES_DIR)
        .map(function(v) {
            return {
                nombre:v,
                fecha:fs.statSync(FILES_DIR +"/"+ v).mtime.getTime()
            };
        });

    var SQL_S=[];
    var archivos_encontrados=[];

    for(var i=0;i<archivos_dir.length;i++){
        var f_dir=archivos_dir[i];
        var encontrado=false;
        for(var j=0;j<archivos_bd.length && !encontrado;j++){
            f_bd=archivos_bd[j];
            if(f_bd.nombre==f_dir.nombre){
                //El archivo esta en el directorio y en la BBDD
                var date_dir=new Date(f_dir.fecha);
                var date_bd=new Date(f_bd.fecha);
                //Descartar hasta el segundo
                var d1=Math.ceil(date_dir.getTime()/10000);
                var d2=Math.ceil(date_bd.getTime()/10000);
                //console.log(d1+" "+d2);
                if(d1>d2){
                    //Actualizo la fecha en BBDD
                    var SQL="UPDATE ARCHIVOS SET fecha='"+date_dir.toString()+"' where id="+f_bd.id+" ";
                    SQL_S.push(SQL);
                }
                encontrado=true;
                archivos_encontrados.push(f_dir.nombre);
            }
        }
    }

    for(var i=0;i<archivos_dir.length;i++){
        if(archivos_encontrados.indexOf(archivos_dir[i].nombre)<0){
            //Esta en el directorio pero no en la BD -> Insertamos
            var SQL="INSERT INTO ARCHIVOS(nombre,fecha) VALUES('"+archivos_dir[i].nombre+"','"+new Date(archivos_dir[i].fecha).toString()+"')";
            SQL_S.push(SQL);
        }
    }

    for(var i=0;i<archivos_bd.length;i++){
        if(archivos_encontrados.indexOf(archivos_bd[i].nombre)<0){
            //Archivo que esta en la BBDD y no en el directorio -> Borrar
            var SQL="DELETE FROM ARCHIVOS WHERE id="+archivos_bd[i].id+" ";
            SQL_S.push(SQL);
        }
    }

    //Ejecutamos todas las sentencias
    var db=new sqlite3.Database(FILE_DB);
    ejecutaSQL(res,SQL_S,db,0)
}

//Funcion para sincronizar las operaciones sobre BBDD
function ejecutaSQL(res,SQL_S,db,i){
    if(i==SQL_S.length){
        db.close;
        obtenerArchivosBD(res,listarDrive);
    }
    else{
        db.run(SQL_S[i],function(err){
            ejecutaSQL(res,SQL_S,db,++i);
        });
    }
}

function listarDrive(res,directorio) {
    global_dir=directorio.sort(compareDir);

    if(global_authDrive){
        var oauth2Client=getOauth2Client();
        var token=fs.readFileSync(TOKEN_PATH_DRIVE);
        oauth2Client.credentials = JSON.parse(token);
        var items=[];
        var gDrive = google.drive('v2');
        gDrive.files.list(
            {
                auth: oauth2Client,
                q: '"' + DRIVE_PARENT_FOLDER_ID + '" in parents'
            },
            function(err2, response) {
                if (err2) {
                    console.log('The API returned an error: ' + err2);
                    return;
                }
                drive = response.items;
                global_drive=drive.sort(compareDrive);
                listarDbox(res);
                res.render("gestion.ejs",{title:"Gestión de Archivos",directorio:directorio,drive:drive});
            }
        );
    }
    else{
        listarDbox(res);
    }
}

function listarDbox(res){
    var URI="https://api.dropbox.com/1/metadata/auto/";
    var json=fs.readFileSync(TOKEN_PATH_DBOX);
    var data=JSON.parse(json);
    var access_token=data.access_token;
    var dboxAuth=getOauth2ClientDbox();

    request.get(URI+DBOX_PARENT_FOLDER,{
        headers: { Authorization: 'Bearer ' + access_token },
        list: true
    },function(err,response,body){
        console.log(err);
        console.log(response);
        console.log(body);
    });

}

function compareDir(a,b){
    if(a.nombre>b.nombre){
        return 1;
    }
    else if (a.nombre<b.nombre) {
        return -1;
    }
    return 0;
}

function compareDrive(a,b){
    if(a.title>b.title){
        return 1;
    }
    else if (a.title<b.title) {
        return -1;
    }
    return 0;
}

exports.sincronizarDrive=function sincronizarDrive(req,res){
    var archivos_encontrados=[];
    var mensajes=[];

    for(var i=0;i<global_dir.length;i++){
        var f_dir=global_dir[i];
        var encontrado=false;
        for(var j=0;j<global_drive.length && !encontrado;j++){
            var f_drive=global_drive[j];
            if(f_dir.nombre==f_drive.title){
                encontrado=true;
                var date_dir=new Date(f_dir.fecha);
                var date_drive=new Date(f_drive.modifiedDate);
                var d1=Math.ceil(date_dir.getTime()/10000);
                var d2=Math.ceil(date_drive.getTime()/10000);
                console.log(d1+"  "+d2);
                if(d1>d2){
                    //console.log("Modificar "+global_drive[i].title);
                    actualizarDrive(f_dir,f_drive.id);
                    mensajes.push("Modificado: El archivo "+f_dir[i].nombre+" se ha modificado");
                }
                archivos_encontrados.push(f_drive.title);
            }
        }
    }

    for(var i=0;i<global_dir.length;i++){
        if(archivos_encontrados.indexOf(global_dir[i].nombre)<0){
            //Esta en el directorio pero no en el drive - Insertar
            //console.log(global_dir[i]);
            insertarDrive(global_dir[i]);
            mensajes.push("Insertado: El archivo "+global_dir[i].nombre+" se ha insertado");
        }
    }

    for(var i=0;i<global_drive.length;i++){
        if(archivos_encontrados.indexOf(global_drive[i].title)<0){
            //Esta en el drive pero no en el directorio -> Eliminar
            //console.log("Eliminar "+global_drive[i].title);
            eliminarDrive(global_drive[i].id);
            mensajes.push("Eliminado: El archivo "+global_drive[i].title+" se ha eliminado");
        }
    }

    res.render("sincronizar.ejs",{title:"Sincronizar Archivos",mensajes:mensajes});
}

function insertarDrive(file){
    var oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH_DRIVE);
    oauth2Client.credentials = JSON.parse(token);

    var gDrive=google.drive('v2');
    var buff=fs.createReadStream(FILES_DIR+"/"+file.nombre);
    // insertion example
    gDrive.files.insert({
        resource: {
            title: file.nombre,
            mimeType: 'text/csv',
            parents: [{"id":DRIVE_PARENT_FOLDER_ID}]
        },
        media: {
            mimeType: 'text/csv',
            body: buff
        },
        auth: oauth2Client
        },
        function(err, response) {
            //console.log('error:', err, 'inserted:', response.id);
        });
}

function actualizarDrive(file,id_drive){
    var oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH_DRIVE);
    oauth2Client.credentials = JSON.parse(token);

    var gDrive=google.drive('v2');
    var buff=fs.createReadStream(FILES_DIR+"/"+file.nombre);
    // insertion example
    gDrive.files.update({
        fileId: id_drive,
        resource: {
            title: file.nombre,
            mimeType: 'text/csv'
        },
        media: {
            mimeType: 'text/csv',
            body: buff
        },
        auth: oauth2Client
        },
        function(err, response) {
            //console.log('error:', err, 'inserted:', response.id);
        });
}

function eliminarDrive(id_drive){
    var oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH_DRIVE);
    oauth2Client.credentials = JSON.parse(token);

    var gDrive=google.drive('v2');
    gDrive.files.delete({
        'fileId': id_drive,
        auth: oauth2Client
    },
    function(err, response) {
        //console.log("Eliminar "+err);
    });
}
