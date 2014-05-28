var  ordrin = (ordrin instanceof Object) ? ordrin : {};

if(!ordrin.hasOwnProperty("tomato")){
  ordrin.tomato = new ordrin.Tomato();
}

if(!ordrin.hasOwnProperty("emitter")){
  ordrin.emitter = new EventEmitter2({wildcard:true});
  if(typeof ordrin.emitterLoaded === "function"){
    ordrin.emitterLoaded(ordrin.emitter);
    delete ordrin.emitterLoaded;
  }
}

(function(tomato, emitter, api, Mustache){
  "use strict";

  var page = tomato.get("page");

  if(!tomato.hasKey("render")){
    tomato.set("render", true);
  }

  var render = tomato.get("render");

  if(!tomato.hasKey("invisible")){
    tomato.set("invisible", false);
  }

  var invisible = tomato.get("invisible");

  var noProxy = tomato.get("noProxy");

  var delivery;
  var validAddress = true;
  var mino;
  var meals;

  var tray;

  var elements = {}; // variable to store elements so we don't have to continually DOM them

  var allItems;

  var Option = api.Option;
  var TrayItem = api.TrayItem;
  var Tray = api.Tray;
  var Address = api.Address;

  var OuterToggledElt = null;

  function getRid(){
    return tomato.get("rid");
  }

  function ridExists(){
    return tomato.hasKey("rid");
  }

  function setRid(rid){
    tomato.set("rid", rid);
  }

  function getMenu(){
    return tomato.get("menu");
  }

  function menuExists(){
    return tomato.hasKey("menu");
  }
  
  function setMenu(menu){
    tomato.set("menu", menu);
    allItems = extractAllItems(menu);
  }

  function getDetails(){
    return tomato.get("details");
  }

  function detailsExists(){
    return tomato.hasKey("details");
  }

  function setDetails(details) {
    return tomato.set("details", details);
  }

  function getAddress(){
    return tomato.get("address");
  }

  function addressExists(){
    return tomato.hasKey("address") && tomato.get("address").addr;
  }

  var addressTemplate= tomato.hasKey("addressTemplate")
                      ? tomato.get("addressTemplate")
                      : '{{addr}}<br>{{#addr2}}{{addr2}}<br>{{/addr2}}{{city}}, {{state}} {{zip}}<br><span class="phoneDisplay">{{phone}}<br></span><a data-listener="editAddress">Edit</a>';

  function setAddress(address){
    tomato.set("address", address);
    switch(page){
      case "confirm":
      case "menu":
        var addressElement = getElementsByClassName(elements.menu, "address")[0];
        if( addressElement ) {
          var addressHtml = Mustache.render(addressTemplate, address);
          addressElement.innerHTML = addressHtml;
        }
        updateFee();
        break;
      case "restaurants": downloadRestaurants(); break;
      default: break;
    }
  }

  function getDeliveryTime(){
    return tomato.get("deliveryTime");
  }

  function getFormattedDeliveryTime() {
    return formatDeliveryTime( tomato.get("deliveryTime") );
  };

  function deliveryTimeExists(){
    return tomato.hasKey("deliveryTime");
  }

  function setDeliveryTime(deliveryTime){
    tomato.set("deliveryTime", deliveryTime);
    switch(page){
      case "confirm":
      case "menu": 
        if( !invisible ) {
          getElementsByClassName(elements.menu, "dateTime")[0].innerHTML = formatDeliveryTime( deliveryTime ); 
        }
        updateFee(); 
        break;
      case "restaurants": downloadRestaurants(); break;
      default: break;
    }
  }

  function formatDeliveryTime( deliveryTime ) {
    var formattedDelivery = '',
        currentTime = new Date(),
        currentDate = currentTime.getDate(),
        dayOfWeek = [ 'Sunday', 'Monday', 'Tuesday',
                      'Wednesday', 'Thursday', 'Friday',
                      'Saturday' ];
    var deliveryHour, deliveryMinutes, deliveryParts;

    if( deliveryTime.toUpperCase() === 'ASAP' ) {
      return 'ASAP';
    }

    if( ! (deliveryTime instanceof Date) ) {
      deliveryParts = deliveryTime.match(/(\d+)\D+(\d+)\D+(\d+)\D(\d+)/)
      deliveryTime = new Date();
      deliveryTime.setMonth( parseInt( deliveryParts[1] ) - 1 );
      deliveryTime.setDate( deliveryParts[2] );
      deliveryTime.setHours( deliveryParts[3] );
      deliveryTime.setMinutes( deliveryParts[4] );
    }

    //   --- is this still necessary?
    // if delivery year is in the past we need to correct it
    if( deliveryTime.getFullYear() < currentTime.getFullYear() ) {
      // if we switched year +1, otherwise set to current year
      if( deliveryTime.getMonth() === '0' && currentTime.getMonth() === '11' ) {
        deliveryTime.setFullYear( currentTime.getFullYear() + 1 );
      } else {
        deliveryTime.setFullYear( currentTime.getFullYear() );
      }
    }

    // today, tomorrow or future
    if( currentDate === deliveryTime.getDate() ) {
      formattedDelivery += "Today, ";
    } else if( new Date(currentTime.getTime() + 86400000).getDate() === deliveryTime.getDate() ) {
      formattedDelivery += "Tomorrow, ";
    } else {
      formattedDelivery += ( deliveryTime.getMonth() + 1 ) + '-'
                         + ( deliveryTime.getDate() ) + ", ";
    }
    
    // day of week
    formattedDelivery += dayOfWeek[ deliveryTime.getDay() ] + ' ';
  
    deliveryHour = deliveryTime.getHours();
    if( deliveryHour > 12 ) {
      deliveryHour = deliveryHour - 12;
    } else if ( deliveryHour === 0 ) {
      deliveryHour = 12;
    }

    deliveryMinutes = deliveryTime.getMinutes();
    if( deliveryMinutes < 10 ) {
      deliveryMinutes = '0' + deliveryMinutes;
    }

    // AM/PM
    formattedDelivery += (deliveryTime.getHours() < 11) 
                             ? deliveryHour + ':' + deliveryMinutes + 'AM'
                             : deliveryHour + ':' + deliveryMinutes + 'PM';
    
    return formattedDelivery;
  }

  function getTray(){
    var tray = tomato.get("tray");
    // IE8 has issues stripping off the prototype methods, so we have to recreate
    if( !tray.getSubtotal ) {
      tray = new Tray( tray.items );
    }
    return tray;
  }

  function trayExists(){
    return tomato.hasKey("tray")
  }

  function setTray(newTray){
    tray = newTray;
    tomato.set("tray", tray);
  }

  function initTrayFromString(str) {
    var newtray = buildTrayFromString(str),
      id;

    if( newtray.items ) {
      for( id in newtray.items ) {
        if( newtray.items.hasOwnProperty(id) ) {
          addTrayItem(newtray.items[id]);
        }
      }
    }
  };

  function getTip(){
    return tomato.get("tip") ? tomato.get("tip") : 0.00;
  }

  function setRestaurant(rid, newMenu, details){
    page = "menu";
    setRid(rid);
    if(newMenu){
      if( details ) {
        setDetails( details );
      }
      setMenu(newMenu);
      if(!trayExists() && tomato.hasKey("trayString")){
        setTray(buildTrayFromString(tomato.get("trayString")));
      } 
      if( !invisible ) {
        renderMenu(newMenu);
      }
      processNewMenuPage();
    } else {
      if(!noProxy){
        api.restaurant.getDetails(rid, function(err, data){
          setMenu(data.menu);
          delete data.menu;
          setDetails(data);
          if( !invisible ) {
            renderMenu(data.menu);
          }
        });
      }
    }
  }

  function processNewMenuPage(){
    getElements();
    populateAddressForm();
    initializeDateForm();
    if(trayExists()){
      var tray = getTray();
      for(var prop in tray.items){
        if(tray.items.hasOwnProperty(prop)){
          addTrayItemNode(tray.items[prop]);
        }
      }
    } else {
      setTray(new Tray());
    }
    listen("click", document.body, clicked);
    listen("change", getElementsByClassName(elements.menu, "ordrinDateSelect")[0], dateSelected);
    setDeliveryTime( getDeliveryTime() );
    updateFee();
  }

  function renderMenu(menuData){
    var menu_div = document.getElementById("ordrinMenu");
    if( !menu_div ) {
      setTimeout( function() { renderMenu(menuData), 1000 } );
      return;
    }

    var data = {menu:menuData, deliveryTime:getDeliveryTime()};
    data.confirmUrl = tomato.get("confirmUrl");
    if(tomato.hasKey("address")){
      data.address = getAddress();
    }
    if(tomato.hasKey("details")) {
      data.details = getDetails();
    }
    var menuHtml = Mustache.render(tomato.get("menuTemplate"), data);

    menu_div.innerHTML = menuHtml;
  }



  function initMenuPage(){
    if(render){
      setRestaurant(getRid(), getMenu(), getDetails());
    } else {
      if(menuExists()){
        setMenu(getMenu());
        if(detailsExists()) {
          setDetails(getDetails());
        }
      } else {
        api.restaurant.getDetails(getRid(), function(err, data){
          setMenu(data.menu);
        });
      }
      processNewMenuPage();
    }
  }

  function buildItemFromString(itemString){
    var re = /(\d+)\/(\d+)((,\d+)*)/;
    var match = re.exec(itemString);
    if(match){
      var id = match[1];
      var quantity = match[2];
      var options = [];
      if(match[3]){
        var opts = match[3].substring(1).split(',');
        for(var i=0; i<opts.length; i++){
          var optId = opts[i];
          var optName = allItems[optId].name;
          var optPrice = allItems[optId].price;
          options.push(new Option(optId, optName, optPrice));
        }
      }
      var name = allItems[id].name;
      var price = allItems[id].price;
      return new TrayItem(id, quantity, options, name, price);
    }
  }

  function buildTrayFromString(trayString){
    var items = {};
    if(typeof trayString === "string" || trayString instanceof String){
      var itemStrings = trayString.split('+');
      for(var i=0; i<itemStrings.length; i++){
        var item = buildItemFromString(itemStrings[i]);
        if(item){
          items[item.trayItemId] = item;
        }
      }
    }
    return new Tray(items);
  }

  function renderConfirm(tray, details){
    var confirmDiv = document.getElementById("ordrinConfirm");
    if( !confirmDiv ) {
      setTimeout( function() { renderConfirm(tray, details), 1000 } );
      return;
    }


    var data = {deliveryTime:getDeliveryTime(), address:getAddress()};
    data.tray = tray;
    data.checkoutUri = tomato.get("checkoutUri");
    data.rid = getRid();
    if( details ) {
      data.details = details;
    }
    var confirmHtml = Mustache.render(tomato.get("confirmTemplate"), data);
    confirmDiv.innerHTML = confirmHtml;
  }

  function initConfirmPage(){
    page = "confirm";
    if(menuExists()){
      if(!trayExists()){
        setTray(buildTrayFromString(tomato.get("trayString")));
      }
      if( !invisible ) {
        renderConfirm(getTray());
      }
      processNewMenuPage();
    } else {
      api.restaurant.getDetails(getRid(), function(err, data){
        setMenu(data.menu);
        delete data.menu;
        setDetails(data);
        if(!trayExists()){
          setTray(buildTrayFromString(tomato.get("trayString")));
        } 
        if( !invisible ) {
          renderConfirm(getTray(), getDetails());
        }
        processNewMenuPage();
      });
    }
  }

  function renderRestaurants(restaurants){
    var params = {};
    var address = getAddress(), deliveryTime = getDeliveryTime();
    for(var prop in address){
      if(address.hasOwnProperty(prop)){
        params[prop] = encodeURIComponent(address[prop] || '');
      }
    }
    params.dateTime = deliveryTime;
    for(var i=0; i<restaurants.length; i++){
      restaurants[i].params = params;
    }
    var data = {restaurants:restaurants};
    var restaurantsHtml = Mustache.render(tomato.get("restaurantsTemplate"), data);
    document.getElementById("ordrinRestaurants").innerHTML = restaurantsHtml;
  }

  function downloadRestaurants(){
    if(!noProxy){
      api.restaurant.getDeliveryList(getDeliveryTime(), getAddress(), function(err, data){
        for(var i=0; i<data.length; i++){
          data[i].is_delivering = !!(data[i].is_delivering);
        }
        if( !invisible ) {
          renderRestaurants(data);
        }
      });
    }
  }

  function initRestaurantsPage(){
    if(render){
      if(tomato.hasKey("restaurants")){
        renderRestaurants(tomato.get("restaurants"));
      } else {
        downloadRestaurants();
      }
    }
  }



  function addTrayItem(item){
    tray.addItem(item);
    tomato.set("tray", tray);
    emitter.emit("tray.add", item);
  }

  function removeTrayItem(id){
    var removed = tray.removeItem(id);
    tomato.set("tray", tray);
    emitter.emit("tray.remove", removed);
  }

  function dateSelected(){
    if(document.forms["ordrinDateTime"].date.value === "ASAP"){
      hideElement(getElementsByClassName(elements.menu, "timeForm")[0]);
    } else {
      unhideElement(getElementsByClassName(elements.menu, "timeForm")[0]);
    }
  }

  //All prices should be in cents

  function toCents(value){
    if( !value ) { return 0; }

    if(value.indexOf('.') < 0){
      return (+value)*100;
    } else {
      var match = value.match(/(\d*)\.(\d{2})\d*$/);
      if(match){
        return +(match[1]+match[2]);
      } else {
        match = value.match(/(\d*)\.(\d)$/);
        if(match){
          return +(match[1]+match[2])*10;
        } else {
          console.log(value+" is not an amount of money");
        }
      }
    }
  }

  function toDollars(value){
    if( !value ) {
      return '0.00';
    }

    value = value.toString();
    if( value.indexOf('.') !== -1 ) {       
      return value;
    } 

    var cents = value.toString();
    while(cents.length<3){
      cents = '0'+cents;
    }
    var index = cents.length - 2;
    return cents.substring(0, index) + '.' + cents.substring(index);
  }

  tomato.register("ordrinApi", [Option, TrayItem, Tray, Address])

  function updateTip(){
    var tipNodes = getElementsByClassName(elements.menu, "tipInput"),
        tip;

    if( tipNodes && tipNodes.length > 0 ) {
      tip = toCents(tipNodes[0].value+"");
      tomato.set("tip", tip);
    }

    updateFee();
  }

  function updateFee(){
    // if we don't have an address we can't do fee update
    if( typeof getAddress().addr == 'undefined' ) {
      return;
    }

    // check if we should show provider
    if( tomato.get( "details" ).rds_info.name  !== "Ordr.in" ) {
      var provider = getElementsByClassName(elements.menu, "provider")[0];
      if( provider ) {
        provider.className = provider.className.replace(/\s*hidden\s*/,'');
      }
    }

    var subtotalElem = getElementsByClassName(elements.menu, "subtotalValue")[0];
    var tipElem = getElementsByClassName(elements.menu, "tipValue")[0];
    var countElem = getElementsByClassName(elements.menu, "itemCount")[0];

    var subtotal = getTray().getSubtotal();
    if( subtotalElem ) {
      subtotalElem.innerHTML = toDollars(subtotal);
    }

    if( countElem ) {
      var size = function(obj) {
        var size = 0, key;
        for (key in obj) {
          if (obj.hasOwnProperty(key)) size += obj[key].quantity;
        }
        return size;
      };
      countElem.innerHTML = size( getTray().items );
    }
    var tip = getTip();
    if( tipElem && tipElem.tagName === 'INPUT') {
      tipElem.value = toDollars(tip);
    } else if(tipElem) {
      tipElem.innerHTML = toDollars(tip);
    }
    if(noProxy){
      var total = subtotal + tip,
          totalElements = getElementsByClassName(elements.menu, "totalValue")
          i;
        for( i = 0; i < totalElements.length; i++ ) { 
          totalElements[i].innerHTML = toDollars(total);
        }
    } else {
      api.restaurant.getFee(getRid(), toDollars(subtotal), toDollars(tip), getDeliveryTime(), getAddress(), function(err, data){
        if(err){
          handleError(err);

        } else if(data.msg) {
          handleError(data);

        } else if(data._msg) {
          if( data._msg.match( /normalize/i ) ) {
            validAddress = false;
            handleError( {msg: "We could not find your address, please check it and try again."} );
            return;
          }
          handleError({msg:data._msg});

        } else {
          validAddress = true;
          var deliveryTime = getElementsByClassName(elements.menu, "deliveryTimeValue");
          for( var i = 0; i < deliveryTime.length; i++ ) {
            deliveryTime[i].innerHTML = data.del ? data.del : 'TBD';
          }
          var minOrder = getElementsByClassName(elements.menu, "minOrderValue");
          for( var j = 0; j < minOrder.length; j++ ) {
            mino = data.mino ? data.mino : 'TBD'
            minOrder[j].innerHTML = mino;
          }

          // Check what to do with fee and tax values
          var feeValues = getElementsByClassName(elements.menu, "feeValue");
          for( var i = 0; i < feeValues.length; i++ ) {
            feeValues[i].innerHTML = data.fee ? data.fee : "TBD";
          }
          var taxElem = getElementsByClassName(elements.menu, "taxValue")[0];
          if( taxElem ) {
            taxElem.innerHTML = data.tax ? data.tax : "0.00";
          }
          var total = subtotal + tip + toCents(data.fee) + toCents(data.tax),
              totalElements = getElementsByClassName(elements.menu, "totalValue")
              i;
          for( i = 0; i < totalElements.length; i++ ) {
            totalElements[i].innerHTML = toDollars(total);
          };
          meals = data.meals;
          delivery = data.delivery;
          if(data.delivery === 0){
            handleError({delivery:0, msg:data.msg});
          } else {
            hideErrorDialog();
            // unhide details element if it exists
            var featDetails = document.getElementById('feat-details');
            if( featDetails ) {
              featDetails.className = featDetails.className.replace(/\s*hidden\s*/,'')
            }
          }
        }
      });
    }
  }

  function hideElement(element){
    if( !element ) { return; }
    element.className += " hidden";
    if(element == OuterToggledElt) {
      OuterToggledElt = null;
    }
  }

  function unhideElement(element, hasOuterToggle){
    if( !element ) { return; }
    element.className = element.className.replace(/\s?\bhidden\b\s?/g, ' ').replace(/(\s){2,}/g, '$1');
    if( hasOuterToggle ) {
      OuterToggledElt = element;
    }
  }

  //hasOuterToggle means the dialog closes if they click anywhere outside of the dialog
  //hasOuterToggle really onlly matters for unhiding - since hide can check for equality
  //unhide instead of show makes me sad
  function toggleHideElement(element, hasOuterToggle ){
    hasOuterToggle = hasOuterToggle === true ? true : false;
    if(/\bhidden\b/.test(element.className)){
      unhideElement(element, hasOuterToggle);
    } else {
      hideElement(element);
    }
  }

  function showErrorDialog(msg){
    if( invisible ) {
      console.log( msg );
      return;
    }
    // show background
    elements.errorBg.className = elements.errorBg.className.replace(/hidden/g, "");

    getElementsByClassName(elements.errorDialog, "errorMsg")[0].innerHTML = msg;
    // show the dialog
    elements.errorDialog.className = elements.errorDialog.className.replace(/hidden/g, "");
  }

  function hideErrorDialog(){
    hideElement(elements.errorBg)
    hideElement(elements.errorDialog)
    clearNode(getElementsByClassName(elements.errorDialog, "errorMsg")[0]);
  }
  
  function listen(evnt, elem, func) {
    if( !elem ) {
      return;
    }

    if (elem.addEventListener)  // W3C DOM
      elem.addEventListener(evnt,func,false);
    else if (elem.attachEvent) { // IE DOM
      var r = elem.attachEvent("on"+evnt, func);
      return r;
    }
  }

  function goUntilParent(node, targetClass){
    var re = new RegExp("\\b"+targetClass+"\\b")
    if (node.className.match(re) === null){
      while(node.parentNode !== document){
        node = node.parentNode;
        if (node.className.match(re) !== null){
          break;
        }
      }
      return node;
    } else {
      return node;
    }
  }

  function clearNode(node){
    if( !node ) { return; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
  }

  function extractAllItems(itemList){
    var items = {};
    var item;
    for(var i=0; i<itemList.length; i++){
      item = itemList[i];
      items[item.id] = item;
      if(typeof item.children !== "undefined"){
        var children = extractAllItems(item.children);
        for(var id in children){
          if(children.hasOwnProperty(id)){
            items[id] = children[id];
          }
        }
      }
      else{
        item.children = false;
      }
      if(typeof item.descrip === "undefined"){
        item.descrip = "";
      }
    }
    return items;
  }

  function populateAddressForm(){
    if(addressExists() && document.forms["ordrinAddress"]){
      var address = getAddress();
      var form = document.forms["ordrinAddress"];
      form.addr.value = address.addr || '';
      form.addr2.value = address.addr2 || '';
      form.city.value = address.city || '';
      form.state.value = address.state || '';
      form.zip.value = address.zip || '';
      form.phone.value = address.phone || '';
    }
  }

  function padLeft(number, size, c){
    if(typeof c === "undefined"){
      c = "0";
    }
    var str = ''+number;
    var len = str.length
    for(var i=0; i<size-len; i++){
      str = c+str;
    }
    return str;
  }

  function initializeDateForm(){
    var parts, timepart, thehour, thedate, thetime, thehalf;
    var form = document.forms["ordrinDateTime"];
    if( !form || !form.date ) {
      return;
    }
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var date = new Date();
    var option = document.createElement("option");
    option.setAttribute("value", padLeft(date.getMonth()+1, 2)+'-'+padLeft(date.getDate(), 2));
    option.innerHTML = "Today, "+days[date.getDay()];
    form.date.appendChild(option);
    
    option = document.createElement("option");
    date.setDate(date.getDate()+1);
    option.setAttribute("value", padLeft(date.getMonth()+1, 2)+'-'+padLeft(date.getDate(), 2));
    option.innerHTML = "Tomorrow, "+days[date.getDay()];
    form.date.appendChild(option);
    
    option = document.createElement("option");
    date.setDate(date.getDate()+1);
    option.setAttribute("value", padLeft(date.getMonth()+1, 2)+'-'+padLeft(date.getDate(), 2));
    option.innerHTML = months[date.getMonth()]+" "+date.getDate()+', '+days[date.getDay()];
    form.date.appendChild(option);

    parts = ordrin.init.deliveryTime.split('+');
    if( parts.length === 2 ) {
      thedate = parts[0];
      form.date.value = thedate;

      timepart = parts[1].split(':');
      thehour = parseInt( timepart[0], 10 );
      if( thehour > 12 ) {
        thehour = padLeft(thehour - 12, 2);
        thehalf = 'PM';
      } else if( thehour === 12 ) {
        thehour = padLeft(thehour, 2);
        thehalf = 'PM';
      } else {
        thehour = padLeft(thehour, 2);
        thehalf = 'AM';
      }
      form.time.value = [thehour,timepart[1]].join(':');
      form.ampm.value = thehalf;
    }
  }

  function clicked(event){
    if (typeof event.srcElement == "undefined"){
      event.srcElement = event.target;
    }
    // call the appropiate function based on what element was actually clicked
    var routes = {  
      menuItem    : createDialogBox,
      editTrayItem : createEditDialogBox,
      closeDialog : hideDialogBox,
      addToTray : addDialogItemToTray,
      removeTrayItem : removeTrayItemFromNode,
      optionCheckbox : validateCheckbox,
      updateTray : updateTip,
      updateAddress : saveAddressForm,
      editAddress : showAddressForm,
      updateDateTime : saveDateTimeForm,
      editDeliveryTime : showDateTimeForm,
      closeError : hideErrorDialog,
      confirmOrder : confirmOrder
    }
    var node = event.srcElement;

        //if we have a live toggled node and the clicked element is *not* a child
        //of that node then we want to short circuit and hit the toggle
    var isChildOfToggledElt = OuterToggledElt ? OuterToggledElt.contains(node) : false,
        doToggle            = OuterToggledElt && ! isChildOfToggledElt;

    while(!node.hasAttribute("data-listener")){
      if(node.tagName.toUpperCase() === "HTML"){
        //if we reach the top of the page w/out a listener, check for toggle
        if( doToggle ) { toggleHideElement( OuterToggledElt ) }
        return;
      }
      node = node.parentNode;
    }
    var name = node.getAttribute("data-listener");

    //if we found a listener, ignore it if we're supposed to toggle
    if( doToggle ) {
      toggleHideElement( OuterToggledElt );
      return;
    }

    if (typeof routes[name] != "undefined"){
      routes[name](node);
    }
  }

  function confirmOrder(){
    var form = document.forms.ordrinOrder;
    if(!addressExists()){
      handleError({msg:"No address set"});
      return;
    }

    if( ! validAddress ) {
      handleError({msg:"The restaurant does not deliver to your address."});
      return;
    }

    if(!delivery){
      handleError({msg:"The restaurant is not open for online ordering at this time."});
      return;
    }

    if( getTray().getTotal() < ( mino * 100 ) ) {
      handleError({msg:"The minimum order for this restaruant is $" + mino + "."});
      return;
    }

    var address = getAddress()
    if( !invisible ) {
      form.addr.value = address.addr || '';
      form.addr2.value = address.addr2 || '';
      form.city.value = address.city || '';
      form.state.value = address.state || '';
      form.zip.value = address.zip || '';
      form.phone.value = address.phone || '';
      form.dateTime.value = getDeliveryTime();
      form.tray.value = getTray().buildTrayString();
      form.tip.value = tomato.get("tip");
      form.rid.value = getRid();
      form.submit();
    }

    emitter.emit("order.confirmed", true);
  }

  function showAddressForm(){
    toggleHideElement(getElementsByClassName(elements.menu, "addressForm")[0], true );
  }

  function showDateTimeForm(){
    toggleHideElement(getElementsByClassName(elements.menu, "dateTimeForm")[0], true );
    dateSelected();
  }

  function saveDateTimeForm(){
    var form = document.forms["ordrinDateTime"];
    var date = form.date.value;
    var deliveryTime, deliveryParts, dateTime; 
    hideErrorDialog();
    if(date === "ASAP"){
      setDeliveryTime("ASAP");
    } else {
      var now = new Date();
      var split = form.time.value.split(":");
      var hours = split[0]==="12"?0:+split[0];
      var minutes = +split[1];
      if(form.ampm.value === "PM"){
        hours += 12;
      }
      var time = padLeft(hours,2)+":"+padLeft(minutes,2);
      dateTime = date+"+"+time;

      deliveryParts = dateTime.match(/(\d+)\D+(\d+)\D+(\d+)\D(\d+)/)
      deliveryTime = new Date();
      deliveryTime.setMonth( parseInt( deliveryParts[1] ) - 1 );
      deliveryTime.setDate( deliveryParts[2] );
      deliveryTime.setHours( deliveryParts[3] );
      deliveryTime.setMinutes( deliveryParts[4] );

      if( deliveryTime < now ) {
        showErrorDialog( "Selected time is in the past." );
        return;
      }
      
      setDeliveryTime(date+"+"+time);
    }
    hideElement(getElementsByClassName(elements.menu, "dateTimeForm")[0]);
  }

  function saveAddressForm(){
    var form = document.forms["ordrinAddress"];
    var inputs = ['addr', 'addr2', 'city', 'state', 'zip', 'phone'];
    for(var i=0; i<inputs.length; i++){
      getElementsByClassName(elements.menu, inputs[i]+"Error")[0].innerHTML = '';
    }
    try {
      var address = new api.Address(form.addr.value, form.city.value, form.state.value, form.zip.value, form.phone.value, form.addr2.value);
      setAddress(address);
      populateAddressForm();
      hideElement(getElementsByClassName(elements.menu, "addressForm")[0]);
    } catch(e){
      console.log(e.stack);
      if(typeof e.fields !== "undefined"){
        var keys = Object.keys(e.fields);
        for(var i=0; i<keys.length; i++){
          getElementsByClassName(elements.menu, keys[i]+"Error")[0].innerHTML = e.fields[keys[i]];
        }
      }
    }
  }

  function getChildWithClass(node, className){
    var re = new RegExp("\\b"+className+"\\b");
    for(var i=0; i<node.children.length; i++){
      if(re.test(node.children[i].className)){
        return node.children[i];
      }
    }
  }

  function getElementsByClassName(node, className){
    if( !node ) {
      return [];
    }
    if(typeof node.getElementsByClassName !== "undefined"){
      return node.getElementsByClassName(className);
    }
    var re = new RegExp("(?:\\s|^)"+className+"(?:\\s|$)");
    var nodes = [];
    for(var i=0; i<node.children.length; i++){
      var child = node.children[i];
      if(re.test(child.className)){
        nodes.push(child);
      }
      nodes = nodes.concat(getElementsByClassName(child, className));
    }
    return nodes;
  }

  function createDialogBox(node){
    var itemId = node.getAttribute("data-miid");
    var isAvailable = false;

    for( var availMeal in allItems[itemId].availability ) {
      if( !meals ) {
        isAvailable = true;
        break;
      }
      for( var meal in meals) {
        if( allItems[itemId].availability[ availMeal ] == meals[ meal ] ) { // check
          isAvailable = true;
          break;
        }
        if( isAvailable ) { break; }
      } 
    }

    if( isAvailable ) {
      buildDialogBox(itemId);
      showDialogBox( node );
      emitter.emit("menuitem.shown", true);
      hideErrorDialog();
    } else {
      handleError( { msg : "Sorry, this item is not currently available" } );
    }
  }

  function createEditDialogBox(node){
    var itemId = node.getAttribute("data-miid");
    var trayItemId = node.getAttribute("data-tray-id");
    var trayItem = getTray().items[trayItemId];
    if( !trayItem.hasOptionSelected ) {
      trayItem = new TrayItem( trayItem['id'], trayItem['quantity'], trayItem['options'], trayItem['name'], trayItem['price'] );
    }
    buildDialogBox(itemId);
    var options = getElementsByClassName(elements.dialog, "option");
    for(var i=0; i<options.length; i++){
      var optId = options[i].getAttribute("data-moid");
      var checkbox = getElementsByClassName(options[i], "optionCheckbox")[0];
      checkbox.checked = trayItem.hasOptionSelected(optId);
    }
    var button = getElementsByClassName(elements.dialog, "buttonRed")[0];
    if( button ) {
      button.setAttribute("value", "Save to Tray");
    }
    var quantity = getElementsByClassName(elements.dialog, "itemQuantity")[0];
    quantity.setAttribute("value", trayItem.quantity);
    elements.dialog.setAttribute("data-tray-id", trayItemId);
    showDialogBox( node );
    emitter.emit("menuitem.shown", true);
  }

  function buildDialogBox(id){
    elements.dialog.innerHTML = Mustache.render(tomato.get("dialogTemplate"), allItems[id]);
    elements.dialog.setAttribute("data-miid", id);
  }
  
  function showDialogBox( node ){
    // if in an iframe, fix top
    if( top !== self && document.body.scrollTop === 0 ) {
      elements.dialog.style.top =  ( node.offsetTop - 250 ) + "px";
    } else {
      elements.dialog.style.top =  "0px";
    }

    // show background
    elements.dialogBg.className = elements.dialogBg.className.replace("hidden", "");

    // show the dialog
    elements.dialog.className = elements.dialog.className.replace("hidden", "");
  }

  function hideDialogBox(){
    elements.dialogBg.className   += " hidden";
    clearNode(elements.dialog);
    elements.dialog.removeAttribute("data-tray-id");
  }

  function removeTrayItemFromNode(node){
    var item = goUntilParent(node, "trayItem");
    removeTrayItem(item.getAttribute("data-tray-id"));
  }

  function validateGroup(groupNode){
    var group = allItems[groupNode.getAttribute("data-mogid")];
    var min = +(group.min_child_select);
    var max = +(group.max_child_select);
    var checkBoxes = getElementsByClassName(groupNode, "optionCheckbox");
    var checked = 0;
    var errorNode = getChildWithClass(groupNode, "error");
    clearNode(errorNode);
    for(var j=0; j<checkBoxes.length; j++){
      if(checkBoxes[j].checked){
        checked++;
      }
    }
    if(checked<min){
      error = true;
      var errorText = "You must select at least "+min+" option" + (min === 1 ? '' : 's');
      var error = document.createTextNode(errorText);
      errorNode.appendChild(error);
      return false;
    }
    if(max>0 && checked>max){
      error = true;
      var errorText = "You must select at most "+max+" option" + (min === 1 ? '' : 's');
      var error = document.createTextNode(errorText);
      errorNode.appendChild(error);
      return false;
    }
    return true;
  }

  function validateCheckbox(node){
    var category = goUntilParent(node, "optionCategory");
    validateGroup(category);
  }

  function createItemFromDialog(){
    var id = elements.dialog.getAttribute("data-miid");
    var quantity = getElementsByClassName(elements.dialog, "itemQuantity")[0].value;
    if(quantity<1){
      quantity = 1;
    }

    var error = false;
    var categories = getElementsByClassName(elements.dialog, "optionCategory");
    for(var i=0; i<categories.length; i++){
      if(!validateGroup(categories[i])){
        error = true;
      }
    }

    if(error){
      return;
    }
    var options = [];
    var checkBoxes = getElementsByClassName(elements.dialog, "optionCheckbox");
    for(var i=0; i<checkBoxes.length; i++){
      if(checkBoxes[i].checked){
        var listItem = goUntilParent(checkBoxes[i], "option")
        var optionId = listItem.getAttribute("data-moid");
        var optionName = allItems[optionId].name;
        var optionPrice = allItems[optionId].price;
        var option = new Option(optionId, optionName, optionPrice)
        options.push(option);
      }
    }
    var itemName = allItems[id].name;
    var itemPrice = allItems[id].price;
    var trayItem =  new TrayItem(id, quantity, options, itemName, itemPrice);
    if(elements.dialog.hasAttribute("data-tray-id")){
      trayItem.trayItemId = +(elements.dialog.getAttribute("data-tray-id"));
    }
    return trayItem;
  }

  function addDialogItemToTray(){
    var trayItem = createItemFromDialog();
    if(!addressExists()){
      handleError({msg:"We need your address to be sure this restaurant delivers to you. Please enter it."});
      hideDialogBox();
      return;
    }
    addTrayItem(trayItem);
    hideDialogBox();
    if(!delivery){
      handleError({msg:"The restaurant is not available for online orders to this address at the chosen time"});
    }
  }

  function getElements(){
    switch(page ){
    case "menu":
      var menu          = document.getElementById("ordrinMenu");
      elements.menu     = menu;
      elements.dialog   = getElementsByClassName(menu, "optionsDialog")[0];
      elements.dialogBg = getElementsByClassName(menu, "dialogBg")[0];
      elements.errorDialog = getElementsByClassName(menu, "errorDialog")[0];
      elements.errorBg = getElementsByClassName(menu, "errorBg")[0];
      elements.tray     = getElementsByClassName(menu, "tray")[0];
      break;
    case "confirm":
      var confirm          = document.getElementById("ordrinConfirm");
      elements.menu     = confirm;
      elements.dialog   = getElementsByClassName(confirm, "optionsDialog")[0];
      elements.dialogBg = getElementsByClassName(confirm, "dialogBg")[0];
      elements.errorDialog = getElementsByClassName(confirm, "errorDialog")[0];
      elements.errorBg = getElementsByClassName(confirm, "errorBg")[0];
      elements.tray     = getElementsByClassName(confirm, "tray")[0];
      break;
    }
  }

  function handleError(error){
    if( invisible ) {
      emitter.emit("ordrin.error", error);
      return;
    }
    if(typeof error === "object" && typeof error.msg !== "undefined"){
      showErrorDialog(error.msg);
    } else if (typeof error === "object" && typeof error._msg !== "undefined") {
      showErrorDialog(error._msg);
    } else {
      showErrorDialog(JSON.stringify(error));
    }
  }

  function renderItemHtml(item){
    var html = Mustache.render(tomato.get("trayItemTemplate"), item);
    var div = document.createElement("div");
    div.innerHTML = html;
    return div.firstChild;
  }

  function addTrayItemNode(item){
    if( !elements.tray ) { return; }
    var newNode = renderItemHtml(item);
    var pageTrayItems = getElementsByClassName(elements.tray, "trayItem");
    for(var i=0; i<pageTrayItems.length; i++){
      if(+(pageTrayItems[i].getAttribute("data-tray-id"))===item.trayItemId){
        elements.tray.replaceChild(newNode, pageTrayItems[i]);
        return;
      }
    }
    elements.tray.appendChild(newNode);
  }

  function removeTrayItemNode(removed){
    var children = elements.tray.children;
    for(var i=0; i<children.length; i++){
      if(+(children[i].getAttribute("data-tray-id")) === removed.trayItemId){
        elements.tray.removeChild(children[i]);
        break;
      }
    }
  }

  function init(){
    if(!deliveryTimeExists()){
      setDeliveryTime("ASAP");
    }
    switch(page){
      case "menu": initMenuPage(); break;
      case "restaurants": initRestaurantsPage(); break;
      case "confirm": initConfirmPage(); break;
    }
    if(!emitter.listeners("mustard.error").length){
      emitter.on("mustard.error", handleError);
    }
    ordrin.mustard = {
      getRid : getRid,
      getMenu : getMenu,
      getAddress : getAddress,
      setAddress : setAddress,
      getDeliveryTime : getDeliveryTime,
      setDeliveryTime : setDeliveryTime,
      getTray : getTray,
      setTray : setTray,
      initTrayFromString : initTrayFromString,
      updateTip : updateTip,
      getTip : getTip,
      setRestaurant : setRestaurant,
      initConfirmPage : initConfirmPage,
      clicked : clicked
    };
    emitter.on("tray.add", addTrayItemNode);
    emitter.on("tray.remove", removeTrayItemNode);
    emitter.on("tray.*", updateTip);
    emitter.emit("moduleLoaded.mustard", ordrin.mustard);
  };
  
  init();
})(ordrin.tomato, ordrin.emitter, ordrin.api, ordrin.Mustache);
