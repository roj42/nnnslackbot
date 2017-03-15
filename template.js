//Template for new modules
//Author: Roger Lampe roger.lampe@gmail.com

var sf = require('./sharedFunctions.js');

module.exports = function() {

  var ret = {

    addResponses: function(controller) {
      //Controller.hears...
    },
    addHelp: function(helpFile) {
      //helpFile.command = ...
    }
  };
  return ret;
}();
//'private' functions
