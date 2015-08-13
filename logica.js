var fs = require('fs');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var Dropbox = require("dropbox");
var request = require('request');
var sqlite3 = require("sqlite3").verbose();

var util = require("util");

var URI_DRIVE = ['https://www.googleapis.com/auth/drive'];
var URI_DBOX = ["https://www.dropbox.com/1/oauth2/authorize","https://api.dropbox.com/1/oauth2/token"];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH_DRIVE = TOKEN_DIR + 'drive-api.json';
var TOKEN_PATH_DBOX= TOKEN_DIR + "dbox-api.json";
var FOLDER="MisPedidos";

var FILE_DB="mispedidos.db";
var FILES_DIR="./files";

var global_dir=[];
var global_drive=[];
var global_dbox=[];
var global_authDrive=false;
var global_authDbox=false;
var global_parent_folder_drive="";
var global_parent_folder_dbox="";

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

        /*
        req.session.token=data.access_token;
        request.post('https://api.dropbox.com/1/account/info', {
            headers: { Authorization: 'Bearer ' + token }
        }, function (error, response, body) {
            res.send('Logged in successfully as ' + JSON.parse(body).display_name + '.');
        });
        */

    });

}

function getOauth2ClientDbox(){
    var content=fs.readFileSync('client_secret_drop.json');
    var json=JSON.parse(content);
    var dboxAuth=new Object();
    dboxAuth.app_key=json.web.app_key;
    dboxAuth.app_secret=json.web.app_secret;
    dboxAuth.redirect_uri=json.web.redirect_uri;
    return dboxAuth;
}

/**COMPROBAR DIRECTORIOS******************************************/

exports.gestionFicheros=function gestionFicheros(req, res){
    console.log("INICIO GESTION FICHEROS");
    if(global_authDrive && global_parent_folder_drive==""){
        comprobarDirectorioDrive(res);
    }
    else if(global_authDbox && global_parent_folder_dbox==""){
        comprobarDirectorioDbox(res);
    }
    else{
        obtenerArchivosBD(res,sincronizarDirectorioBD);
    }
}

function comprobarDirectorioDrive(res){
    console.log("COMPROBAR DIRECTORIO");
    var oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH_DRIVE);
    oauth2Client.credentials = JSON.parse(token);
    var items=[];
    var gDrive = google.drive('v2');
    gDrive.files.list(
        {
            auth: oauth2Client,
            q: "title='"+FOLDER+"' and mimeType='application/vnd.google-apps.folder'"
        },
        function(err, response) {
            if (err) {
                console.log('The API returned an error: ' + err);
                return;
            }
            var items=response.items;
            if(items.length==0){
                crearDirectorioDrive(res);
            }
            else{
                var id=items[0].id;
                global_parent_folder_drive=id;
                comprobarDirectorioDbox(res);
            }
        }
    );
}

function crearDirectorioDrive(res){
    console.log("CREAR DIRECTORIO");
    var oauth2Client=getOauth2Client();
    var token=fs.readFileSync(TOKEN_PATH_DRIVE);
    oauth2Client.credentials = JSON.parse(token);

    var gDrive=google.drive('v2');
    gDrive.files.insert({
        resource: {
            title: FOLDER,
            mimeType: 'application/vnd.google-apps.folder',
            parents: []
        },
        auth: oauth2Client
        },
        function(err, response) {
            if(!err){
                global_parent_folder_drive=response.id;
                comprobarDirectorioDbox(res);
            }
        }
    );
}

function comprobarDirectorioDbox(res){
    console.log("COMPROBAR DIRECTORIO DBOX");
    var URI="https://api.dropbox.com/1/search/auto";
    var json=fs.readFileSync(TOKEN_PATH_DBOX);
    var data=JSON.parse(json);
    var access_token=data.access_token;
    var dboxAuth=getOauth2ClientDbox();

    request.get(URI+"?query="+FOLDER,{
        headers: { Authorization: 'Bearer ' + access_token }
    },function(err,response,body){
        var data=JSON.parse(body);
        if(data.length==0){
            crearDirectorioDbox(res);
        }
        else{
            global_parent_folder_dbox=data[0].path;
            obtenerArchivosBD(res,sincronizarDirectorioBD);
        }
    });
}

function crearDirectorioDbox(res){
    console.log("CREAR DIRECTORIO DBOX");
    var URI="https://api.dropbox.com/1/fileops/create_folder";
    var json=fs.readFileSync(TOKEN_PATH_DBOX);
    var data=JSON.parse(json);
    var access_token=data.access_token;
    var dboxAuth=getOauth2ClientDbox();

    request.post(URI,{
        headers: { Authorization: 'Bearer ' + access_token },
        form: { root: "auto", path: FOLDER }
    },function(err,response,body){
        if(!err){
            var data=JSON.parse(body);
            global_parent_folder_dbox=data.path;
            obtenerArchivosBD(res,sincronizarDirectorioBD);
        }
    });
}

/***SINCRONIZAR DIRECTORIO******************************************************/

function obtenerArchivosBD(res,callback){
    console.log("OBTENER ARCHIVOS");
    var db=new sqlite3.Database(FILE_DB);
	var SQL="SELECT * FROM ARCHIVOS";
    db.all(SQL,function(err,rows){
        callback(res,rows);
        db.close();
    });
}

function sincronizarDirectorioBD(res,archivos_bd){
    console.log("SINCRONIZAR DB");
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
    console.log("EJECUTA SQL_S");
    if(i==SQL_S.length){
        db.close();
        obtenerArchivosBD(res,listarDrive);
    }
    else{
        db.run(SQL_S[i],function(err){
            ejecutaSQL(res,SQL_S,db,++i);
        });
    }
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

/***SINCRONIZAR DRIVE*******************************************/

function listarDrive(res,directorio) {
    console.log("LISTAR DRIVE");
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
                q: '"' + global_parent_folder_drive + '" in parents'
            },
            function(err2, response) {
                if (err2) {
                    console.log('The API returned an error: ' + err2);
                    return;
                }
                drive = response.items;
                global_drive=drive.sort(compareDrive);
                listarDbox(res);
            }
        );
    }
    else{
        listarDbox(res);
    }
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
    console.log("SINCRONIZAR DRIVE");
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
                if(d1>d2){
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
    console.log("INSERTAR DRIVE");
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
            parents: [{"id":global_parent_folder_drive}]
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
    console.log("ACTUALIZAR DRIVE");
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
    console.log("ELIMINAR DRIVE");
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

/**SINCRONIZAR DROPBOX******************************************/

function listarDbox(res){
    console.log("LISTAR DBOX");
    if(global_authDbox){
        var URI="https://api.dropbox.com/1/metadata/auto";
        var json=fs.readFileSync(TOKEN_PATH_DBOX);
        var data=JSON.parse(json);
        var access_token=data.access_token;
        var dboxAuth=getOauth2ClientDbox();

        request.get(URI+global_parent_folder_dbox,{
            headers: { Authorization: 'Bearer ' + access_token },
            list: true
        },function(err,response,body){
            var data=JSON.parse(body);
            var dbox=data.contents;
            global_dbox=dbox.sort(compareDbox);
            console.log(global_dbox);
            res.render("gestion.ejs",{title:"Gestión de Archivos",directorio:global_dir,drive:global_drive,dbox:global_dbox});
        });
    }
    else{
        res.render("gestion.ejs",{title:"Gestión de Archivos",directorio:global_dir,drive:global_drive,dbox:global_dbox});
    }
}

function compareDbox(aN,bN){
    var a=extraerNombreDbox(aN);
    var b=extraerNombreDbox(bN);
    if(a.title>b.title){
        return 1;
    }
    else if (a.title<b.title) {
        return -1;
    }
    return 0;
}

exports.sincronizarDbox=function sincronizarDbox(req,res){
    console.log("SINCRONIZAR DBOX");
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
                if(d1>d2){
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

function extraerNombreDbox(nom){
    var pos=nom.lastIndexOf("/");
    if(pos>=0){
        pos+=1;
    }
    return nom.substring(pos);
}
