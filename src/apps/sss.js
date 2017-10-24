import {

  $,
  svg4everybody,
  ol,
  proj4,
  moment,
  localforage,
  Vue,
  VueStash,
  utils
} from 'src/vendor.js'
import App from './sss.vue'
import tour from './sss-tour.js'
import profile from './sss-profile.js'
import gokartListener from './gokart-listener.js'

global.tour = tour

global.debounce = function (func, wait, immediate) {
  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  'use strict'
  var timeout
  return function () {
    var context = this
    var args = arguments
    var later = function () {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    var callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, (context && context.wait) || wait)
    if (callNow) func.apply(context, args)
  }
}
var volatileData = {
  // overridable defaults for WMTS and WFS loading
  appType:env.appType,
  // fixed scales for the scale selector (1:1K increments)
  fixedScales: [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 80, 100, 125, 250, 500, 1000, 2000, 3000, 5000, 10000, 25000],
  // default matrix from KMI
  resolutions: [0.17578125, 0.087890625, 0.0439453125, 0.02197265625, 0.010986328125, 0.0054931640625, 0.00274658203125, 0.001373291015625, 0.0006866455078125, 0.0003433227539062, 0.0001716613769531, 858306884766e-16, 429153442383e-16, 214576721191e-16, 107288360596e-16, 53644180298e-16, 26822090149e-16, 13411045074e-16],
  mmPerInch: 25.4,
  displayResolution:[1,1],
  whoami: { email: null },
  layout:{
      screenHeight:0,
      hintsHeight:0,
      screenWidth:0,
      leftPanelHeadHeight:90,
  },
  activeMenu:null,
  activeSubmenu:null,
  hints:null,
  showHints:false,
  // filters for finding layers
  catalogueFilters: [
    ['basemap', 'Base Imagery'],
    ['boundaries', 'Admin Boundaries'],
    ['communications', 'Communications'],
    ['fire', 'Fire Operations'],
    ['meteorology', 'Meteorology'],
    ['vegetation', 'Vegetation'],
    ['tenure', 'Tenure and Land Use'],
    ['infrastructure', 'Infrastructure'],
    ['grid', 'Grid Systems'],
    ['resources', 'Resource Tracking']
  ],
  matrixSets: {
    'EPSG:4326': {
      '1024': {
        'name': 'gda94',
        'minLevel': 0,
        'maxLevel': 17
      }
    }
  }
}

var systemSettings = {
  tourVersion: null,
  undoLimit:0,
  lengthUnit:"km",
  areaUnit:"ha",
  measureFeature:false,
  print:{
      retainBoundingbox:true,
      snapToFixedScale:true,
  },
  overviewMap:true,
  hoverInfo:false,
  resourceLabels:true,
  resourceDirections: true,
  viewportOnly: false,
  rightHandTools: true,
  graticule:true,
  bfrs:{
      bushfireLabels:true,
      viewportOnly: false,
  },
  spotforecast:{
      reportType:3,//3 hourly
      reportHours:null,
      forecastDays:4
  }
}

var persistentData = {
  view: {
    center: [123.75, -24.966]
  },
  // id followed by properties to merge into catalogue
  activeLayers: [
    ['dpaw:resource_tracking_live', {}],
    ['cddp:state_map_base', {}]
  ],
  // blank annotations
  annotations: {
    type: 'FeatureCollection',
    features: []
  },
  drawingLogs:[],
  redoPointer:0,//pointer to the next redo log 
  drawingSequence:0,

  //data in settings will survive across reset
  settings:$.extend({},JSON.parse(JSON.stringify(systemSettings)))
}

global.gokartService = env.gokartService;

global.localforage = localforage
global.$ = $

var resetRe = new RegExp('^\\?([^?]*&)?reset=true(&.*)?$','i')
var result = resetRe.exec(window.location.search)
if (result) {
    localforage.setItem('sssOfflineStore', {}).then(function (v) {
        var searchString = (result[1]?result[1]:"") + ((result[2] && result[2].length > 1)?result[2].substring(1):"")
        document.location.search = (searchString.length === 0)?"":("?" + (result[1]?result[1]:"") + ((result[2] && result[2].length > 1)?result[2].substring(1):""))
    })
} else {
    //check gokart version
    utils.checkVersion(profile)
    Vue.use(VueStash)
    localforage.getItem('sssOfflineStore').then(function (store) {
      var settings = $.extend({},persistentData.settings,store?(store.settings || {}):{})
      var storedData = $.extend({}, persistentData, store || {}, volatileData)
      storedData.settings = settings
    
      global.gokart = new Vue({
        el: 'body',
        components: {
          App
        },
        data: {
          // store contains state we want to reload/persist
          store: storedData,
          pngs: {},
          fixedLayers:[],
          saved: null,
          touring: false,
          tints: {
            'selectedPoint': [['#b43232', '#2199e8']],
            'selectedDivision': [['#000000', '#2199e8'], ['#7c3100','#2199e8'], ['#ff6600', '#ffffff']],
            'selectedRoadClosurePoint': [['#000', '#2199e8']],
            'selectedPlusIcon': [['#006400', '#2199e8']],
          }
        },
        computed: {
          loading: function () { return this.$refs.app.$refs.loading },
          dialog: function () { return this.$refs.app.$refs.dialog },
          map: function () { return this.$refs.app.$refs.map },
          scales: function () { return this.$refs.app.$refs.map.$refs.scales },
          search: function () { return this.$refs.app.$refs.map.$refs.search },
          measure: function () { return this.$refs.app.$refs.map.$refs.measure },
          spotforecast: function () { return this.$refs.app.$refs.map.$refs.spotforecast },
          info: function() { return this.$refs.app.$refs.map.$refs.info},
          active: function () { return this.$refs.app.$refs.layers.$refs.active },
          layers: function () { return this.$refs.app.$refs.layers },
          catalogue: function () { return this.$refs.app.$refs.layers.$refs.catalogue },
          export: function () { return this.$refs.app.$refs.layers.$refs.export },
          annotations: function () { return this.$refs.app.$refs.annotations },
          tracking: function () { return this.$refs.app.$refs.tracking },
          setting: function () { return this.$refs.app.$refs.setting },
          bfrs: function () { return this.$refs.app.$refs.bfrs },
          geojson: function () { return new ol.format.GeoJSON() },
          wgs84Sphere: function () { return new ol.Sphere(6378137) },
          profile: function(){return profile},
          app: function() {return "SSS"},
          utils: function() {return utils},
          env:function() {return env},
          persistentData:function() {
              var vm = this
              $.each(persistentData,function(key,val){
                  persistentData[key] = vm.store[key]
              })
              return persistentData
          },
          tourVersion:function() {
              return this.store.settings.tourVersion
          },
          defaultSettings:function() {
              return systemSettings
          },
          screenHeight:function() {
              return this.store.layout.screenHeight
          },
          hints:function() {
              return this.store.hints
          },
          activeModule:function() {
             return this.store.activeSubmenu || this.store.activeMenu
          },
          isShowHints:function() {
              return this.store.showHints && this.store.hints
          },
          hasHints:function() {
              return this.store.hints
          },
        },
        watch: {
            tourVersion:function(newValue,oldValue) {
                if (newValue !== tour.version) {
                  this.takeTour()
                }
            },
            hints:function(newValue,oldValue) {
                var vm = this
                this.$nextTick(function(){
                    vm.setHintsHeight()
                })
            },
            activeModule:function(newValue,oldValue) {
                var vm = this
                this.$nextTick(function(){
                    vm.store.layout.leftPanelHeadHeight = $("#" + newValue + "-tabs").height() || 90
                    vm.setHintsHeight()
                })
            },
            screenHeight:function(newValue,oldValue) {
                var module = this.store.activeSubmenu || this.store.activeMenu
                if (this[module]["adjustHeight"]) {
                    this[module]["adjustHeight"]()
                }
                this.loading.adjustHeight()
            }
        },
        methods: {
          setHintsHeight:function() {
            if (this[this.activeModule]["adjustHeight"]) {
                this.store.layout.hintsHeight = (this.isShowHints?$("#hints").height():0) + (this.hasHints?32:0)
                this[this.activeModule]["adjustHeight"]()
            }
          },
          takeTour: function() {
              this.store.settings.tourVersion = tour.version
              this.export.saveState()
              this.touring = true
              tour.start()
          },
          setHints:function() {
              this.store.hints = null
              this.store.showHints = false
              var module = this.store.activeSubmenu || this.store.activeMenu
              if (module && this[module]) {
                if (arguments.length === 0 ) {
                    this.store.hints = null
                } else if (arguments.length === 1) {
                    this.store.hints = arguments[0]
                } else {
                    this.store.hints = arguments
                }
              }
          }
        },
        ready: function () {
          var self = this
          self.loading.app.phaseBegin("initialize",20,"Initialize")
          // setup foundation, svg url support
          $(document).foundation()
          svg4everybody()
          // set title
          $('title').text(profile.description)
          // calculate screen res
          $('body').append('<div id="dpi" style="width:1in;display:none"></div>')
          self.dpi = parseFloat($('#dpi').width())
          self.store.dpmm = self.dpi / self.store.mmPerInch
          $('#dpi').remove();
          // get user info
          (function () {
            $.ajax({
                url: "/sso/auth",
                method:"GET",
                dataType:"json",
                success: function (response, stat, xhr) {
                    $.extend(self.store.whoami,response)
                },
                error: function (xhr,status,message) {
                    alert("Get user profile failed.  " + status + " : " + (xhr.responseText || message))
                },
                xhrFields: {
                  withCredentials: true
                }
            })
          })()
          // bind menu side-tabs to reveal the side pane
          var offCanvasLeft = $('#offCanvasLeft')
          $('#menu-tabs').on('change.zf.tabs', function (ev) {
            offCanvasLeft.addClass('reveal-responsive')
            self.map.olmap.updateSize()
          }).on('click', '.tabs-title a[aria-selected=false]', function (ev) {
            offCanvasLeft.addClass('reveal-responsive')
            $(this).attr('aria-selected', true)
            self.map.olmap.updateSize()
          }).on('click', '.tabs-title a[aria-selected=true]', function (ev) {
            offCanvasLeft.toggleClass('reveal-responsive')
            self.map.olmap.updateSize()
          })
          $('#side-pane-close').on('click', function (ev) {
            offCanvasLeft.removeClass('reveal-responsive')
            $('#menu-tabs').find('.tabs-title a[aria-selected=true]').attr('aria-selected', false)
            self.map.olmap.updateSize()
          })
    
          // pack-in catalogue
          self.fixedLayers = self.fixedLayers.concat([{
          /*
            type: 'TileLayer',
            name: 'Firewatch Hotspots 72hrs',
            id: 'landgate:firewatch_ecu_hotspots_last_0_72',
            format: 'image/png',
            refresh: 60
          }, {
          */
            type: 'TimelineLayer',
            name: 'Himawari-8 Hotspots',
            id: 'himawari8:hotspots',
            source: self.env.gokartService + '/hi8/AHI_TKY_FHS',
            params: {
              FORMAT: 'image/png'
            },
            refresh: 300
          }, {
            type: 'TimelineLayer',
            name: 'Himawari-8 True Colour',
            id: 'himawari8:bandtc',
            source: self.env.gokartService + '/hi8/AHI_TKY_b321',
            refresh: 300,
            base: true
          /*
          }, {
            type: 'TimelineLayer',
            name: 'Himawari-8 Band 3',
            id: 'himawari8:band3',
            source: self.env.gokartService + '/hi8/AHI_TKY_b3',
            refresh: 300,
            base: true
          */
          }, {
            type: 'TimelineLayer',
            name: 'Himawari-8 Band 7',
            id: 'himawari8:band7',
            source: self.env.gokartService + '/hi8/AHI_TKY_b7',
            refresh: 300,
            base: true
         /*
          }, {
            type: 'TimelineLayer',
            name: 'Himawari-8 Band 15',
            id: 'himawari8:band15',
            source: self.env.gokartService + '/hi8/AHI_TKY_b15',
            refresh: 300,
            base: true
          }, {
            type: 'TileLayer',
            name: 'State Map Base',
            id: 'cddp:state_map_base',
            base: true
          }, {
            type: 'TileLayer',
            name: 'Virtual Mosaic',
            id: 'landgate:LGATE-V001',
            base: true
          }, {
            type: 'TileLayer',
            name: 'DFES Active Fireshapes',
            id: 'landgate:dfes_active_fireshapes',
            refresh: 60
          */
          }, {
            type: 'TileLayer',
            name: 'Forest Fire Danger Index',
            id: 'bom:forest_fire_danger_index',
            timelineRefresh:300,
            fetchTimelineUrl:function(lastUpdatetime){
                return "/bom/bom:IDZ71117?basetimelayer=bom:IDZ71117_datetime&timelinesize=72&layertimespan=3600&updatetime=" + lastUpdatetime
            }
          }, {
            type: 'TileLayer',
            name: 'Maximum Forest Fire Danger Index',
            id: 'bom:maximum_forest_fire_danger_index',
            timelineRefresh:300,
            fetchTimelineUrl:function(lastUpdatetime){
                return "/bom/bom:IDZ71118?basetimelayer=bom:IDZ71118_datetime&timelinesize=4&layertimespan=86400&updatetime=" + lastUpdatetime
            }
          }, {
            type: 'TileLayer',
            name: 'Grassland Fire Danger Index',
            id: 'bom:grass_fire_danger_index',
            timelineRefresh:300,
            fetchTimelineUrl:function(lastUpdatetime){
                return "/bom/bom:IDZ71122?basetimelayer=bom:IDZ71122_datetime&timelinesize=72&layertimespan=3600&updatetime=" + lastUpdatetime
            }
          }, {
            type: 'TileLayer',
            name: 'Maximum Grassland Fire Danger Index',
            id: 'bom:maximum_grass_fire_danger_index',
            timelineRefresh:300,
            fetchTimelineUrl:function(lastUpdatetime){
                return "/bom/bom:IDZ71123?basetimelayer=bom:IDZ71123_datetime&timelinesize=4&layertimespan=86400&updatetime=" + lastUpdatetime
            }
          }])
    
          // load custom annotation tools
    
          var sssTools = [
            {
              name: 'Fire Boundary',
              icon: 'dist/static/images/iD-sprite.svg#icon-area',
              style: self.annotations.getVectorStyleFunc(self.tints),
              selectedFillColour:[0, 0, 0, 0.25],
              fillColour:[0, 0, 0, 0.25],
              size:2,
              interactions: [self.annotations.polygonDrawFactory()],
              scope:["annotation"],
              showName: true,
              measureLength:true,
              measureArea:true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Draw a fire boundary on map ",
                        "Hold down the 'SHIFT' key during drawing to enable freehand mode. "
                    ]
                }
              ]
            },
            self.annotations.ui.defaultText,
            {
              name: 'Division',
              icon: 'dist/static/symbols/fire/division.svg',
              tints: self.tints,
              perpendicular: true,
              interactions: [self.annotations.pointDrawFactory(), self.annotations.snapToLineFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedDivision',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Division' in map."
                    ]
                }
              ]
            }, {
              name: 'Sector',
              icon: 'dist/static/symbols/fire/sector.svg',
              tints: self.tints,
              perpendicular: true,
              interactions: [self.annotations.pointDrawFactory(), self.annotations.snapToLineFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedDivision',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Sector' in map."
                    ]
                }
              ]
            },{
            /*  name: 'Hot Spot',
              icon: 'fa-circle red',
              interactions: [hotSpotDraw],
              style: hotSpotStyle,
              showName: true
            }, {*/
              name: 'Origin Point',
              icon: 'dist/static/symbols/fire/origin.svg',
              tints: self.tints,
              interactions: [self.annotations.pointDrawFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedPoint',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Origin Point' in map."
                    ]
                }
              ]
            }, {
              name: 'Spot Fire',
              icon: 'dist/static/symbols/fire/spotfire.svg',
              tints: self.tints,
              interactions: [self.annotations.pointDrawFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedPoint',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Spot Fire' in map."
                    ]
                }
              ]
            }, {
              name: 'Road Closure',
              icon: 'dist/static/symbols/fire/road_closure_point.svg',
              tints: self.tints,
              interactions: [self.annotations.pointDrawFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              showName: true,
              selectedTint: 'selectedRoadClosurePoint',
              scope:["annotation"],
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Draw a 'Road Closure' on map ",
                        "Hold down the 'SHIFT' key during drawing to enable freehand mode. "
                    ]
                }
              ]
            }, {
              name: 'Control Line',
              icon: 'dist/static/symbols/fire/controlline.svg',
              interactions: [self.annotations.linestringDrawFactory()],
              size: 1,
              typeIcon: 'dist/static/symbols/fire/plus.svg',
              typeIconSelectedTint: 'selectedPlusIcon',
              typeIconDims: [20,20],
              colour: 'rgba(0, 0, 0, 0.1)',
              showName: true,
              scope:["annotation"],
              style: self.annotations.getVectorStyleFunc(this.tints),
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Draw a 'Control Line' on map ",
                        "Hold down the 'SHIFT' key during drawing to enable freehand mode. "
                    ]
                }
              ]
            },
            self.annotations.ui.defaultLine,
            self.annotations.ui.defaultPolygon,
            self.annotations.ui.defaultPoint
          ]
    
          sssTools.forEach(function (tool) {
            self.annotations.tools.push(tool)
          })
    
          self.loading.app.phaseEnd("initialize")
    
          // load map without layers
          self.loading.app.phaseBegin("init_olmap",10,"Initialize olmap")
          self.map.init()
          self.loading.app.phaseEnd("init_olmap")
    
          self.loading.app.phaseBegin("load_catalogue",20,"Load catalogue",true,true)
          try {
              self.catalogue.loadRemoteCatalogue( function () {
                //add default layers
                var failed_phase = null
                try {
                    self.loading.app.phaseEnd("load_catalogue")
    
                    self.loading.app.phaseBegin("init_map_layers",10,"Initialize map layers")
                    failed_phase = "init_map_layers"
                    self.map.initLayers(self.fixedLayers, self.store.activeLayers)
                    self.loading.app.phaseEnd("init_map_layers")
    
                    // tell other components map is ready
                    self.loading.app.phaseBegin("gk-init",15,"Broadcast 'go-init' event")
                    failed_phase = "gk-init"
                    self.$broadcast('gk-init')
                    self.loading.app.phaseEnd("gk-init")
    
                    // after catalogue load trigger a tour
                    self.loading.app.phaseBegin("gk-postinit",15,"Broadcast 'go-init' event")
                    failed_phase = "gk-postinit"
                    self.$broadcast('gk-postinit')
                    self.loading.app.phaseEnd("gk-postinit")
    
                    self.loading.app.phaseBegin("post_init",10,"Post initialization")
                    failed_phase = "post-init"
                    self.store.layout.screenHeight = $(window).height()
                    self.store.layout.screenWidth = $(window).width()
                    $(window).resize(debounce(function(){
                        if ($(window).height() !== self.store.layout.screenHeight) {
                            self.store.layout.screenHeight = $(window).height()
                        }
                        if ($(window).width() !== self.store.layout.screenWidth) {
                            self.store.layout.screenWidth = $(window).width()
                        }
                    },200))
                    $("#menu-tab-layers-label").trigger("click")
                    self.store.activeMenu = "layers"
                    self.layers.setup()
                    $("#layers-active-label").trigger("click")
                    self.store.activeSubmenu = "active"
                    self.active.setup()
    
                    //check gokart version
                    //utils.checkVersion(self.profile)
    
                    self.loading.app.phaseEnd("post_init")
                } catch(err) {
                    //some exception happens
                    self.loading.app.phaseFailed(failed_phase,err)
                    throw err
                }
                if (self.store.settings.tourVersion !== tour.version) {
                  self.takeTour()
                }
              },function(reason){
                self.loading.app.phaseEnd("load_catalogue")
              })
          } catch(err) {
              //some exception happens
              self.loading.app.failed(err)
              throw err
          }
        }
      })
    })
}
