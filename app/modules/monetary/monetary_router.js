'use strict';

function createMonetaryRouter(){

  function getHealth(){
    return {
      ok:true,
      layer:"monetary",
      status:"healthy"
    };
  }

  function route(req,res){

    if(req.method==="GET" && req.url==="/monetary/health"){

      res.statusCode = 200;
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(getHealth()));
      return true;
    }

    return false;
  }

  return {
    route,
    getHealth
  };

}

module.exports = {
  createMonetaryRouter
};
