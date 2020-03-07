var RuleManager = (function(){

    var data = {

        versions: {

            // Rules Structure v1, from extension's version "???" --> "0.3.2"
            "1": {
                updateFromPrevious: function(_rule){
                    return _rule;
                },
                setStructure: function(_rule){

                    if (!_rule) _rule = {};
                    if (!_rule.code) _rule.code = {};

                    var rule = { _version: '1' };

                    rule.onLoad       = _rule.onLoad       || false;
                    rule.enabled      = _rule.enabled      || false;
                    rule.selector     = _rule.selector     || '';
                    rule.topFrameOnly = _rule.topFrameOnly || false;
                    rule.code = {
                        js:     _rule.code.js    || '',
                        css:    _rule.code.css   || '',
                        html:   _rule.code.html  || '',
                        files:  _rule.code.files || [],
                    };

                    return rule;
                },
                next: null
                // next: '2'
            },

            // Rules Structure v2
            "2": {
                updateFromPrevious: function(_rule){
                    
                    if (!_rule) _rule = {};
                    if (!_rule.options) _rule.options = {};

                    _rule.options = {
                        onLoad:       _rule.onLoad       || false,
                        enabled:      _rule.enabled      || false,
                        topFrameOnly: _rule.topFrameOnly || false
                    };

                    delete _rule.onLoad;
                    delete _rule.enabled;
                    delete _rule.topFrameOnly;

                    return _rule;
                },
                setStructure: function(_rule){

                    if (!_rule) _rule = {};
                    if (!_rule.code) _rule.code = {};
                    if (!_rule.options) _rule.options = {};

                    var rule = { _version: '2' };

                    rule.name       = '';
                    rule.selector   = _rule.selector || '';
                    rule.order      = _rule.order || 0;
                    rule.code = {
                        js:     _rule.code.js    || '',
                        css:    _rule.code.css   || '',
                        html:   _rule.code.html  || '',
                        files:  _rule.code.files || [],
                    };
                    rule.options = {
                        onLoad:       _rule.options.onLoad       || false,
                        enabled:      _rule.options.enabled      || false,
                        topFrameOnly: _rule.options.topFrameOnly || false,
                        ruleID:       _rule.options.ruleID       || '',
                    };

                    return rule;
                },
                next: null
            },
        },

        create: function(_rule){

            var rule = _rule || {};
            var startingVersion = rule._version ? rule._version : '1';

            var checkStructure = function(_currentVersion, _updateFromPrevious){

                // get the rule's version object 
                var version = data.versions[_currentVersion];

                // if exist
                if (version){

                    // update from the previous structure
                    if (_updateFromPrevious){
                        rule = version.updateFromPrevious(rule);
                    }

                    // apply the version structure and call the next one if referenced
                    rule = version.setStructure(rule);
                    rule = checkStructure(version.next, true);
                }
                
                // return the rule object
                return rule;                
            };
            
            return checkStructure(startingVersion);
        }
    };

    return Object.assign(new function RuleStructure(){}, {
        create: function(_rule){
            return data.create(_rule);
        }
    });
}());

var RulesList = (function(){

    var data = {
        rules: [],
        serializedRules: [],

        events: {
            onInit: function(){},
            onChange: function(){}
        },

        add: function(_rule){
            
            // create a new rule with the given object _rule
            var rule = RuleManager.create(_rule);

            // push to list if it's a valid rule
            data.rules.push(rule);
            data.serializedRules = data.serialize(data.rules);
        },
        setRules: function(_rules){

            data.rules.length = 0;
            data.rules = _rules;
            data.serializedRules = data.serialize(data.rules);
        },
        storageChangedHandler: function(_data){
            
            if (_data.rules && _data.rules.newValue){
                data.setRules(_data.rules.newValue);
                data.events.onChange();
            }
        },
        serialize: function(_rules){

            /*
                {
                    type: 'js',
                    enabled: true,
                    selector: 'google',
                    topFrameOnly: rule.topFrameOnly,
        
                    code: 'alert(true);',
                },
                {
                    type: 'js',
                    enabled: true,
                    selector: 'google',
                    topFrameOnly: rule.topFrameOnly,
        
                    path: '/var/test.js'
                    local: true
                }
            */

            var result = [];
        
            each(_rules, function(){
        
                // skip if the rule is not enabled
                if (!this.enabled) return;
        
                var rule = this;
                
                if (rule.code.files.length){
                    each(rule.code.files, function(){
                        var file = this;
                        if (!file.ext) return;
                        result.push({
                            type: file.ext,
                            enabled: rule.enabled,
                            selector: rule.selector,
                            topFrameOnly: rule.topFrameOnly,
                            path: file.path,
                            local: file.type === 'local',
                            onLoad: rule.onLoad
                        });
                    });
                }
        
                if (containsCode(rule.code.css)){
                    result.push({
                        type: 'css',
                        enabled: rule.enabled,
                        selector: rule.selector,
                        topFrameOnly: rule.topFrameOnly,
                        code: rule.code.css,
                        onLoad: rule.onLoad
                    });
                }
        
                if (containsCode(rule.code.html)){
                    result.push({
                        type: 'html',
                        enabled: rule.enabled,
                        selector: rule.selector,
                        topFrameOnly: rule.topFrameOnly,
                        code: rule.code.html,
                        onLoad: rule.onLoad
                    });
                }
        
                if (containsCode(rule.code.js)){
                    result.push({
                        type: 'js',
                        enabled: rule.enabled,
                        selector: rule.selector,
                        topFrameOnly: rule.topFrameOnly,
                        code: rule.code.js,
                        onLoad: rule.onLoad
                    });
                }
        
            });
        
            return result;
        },
        getInvolvedRules: function(_info){

            /*
                result = [
                    {
                        type: 'js',
                        code: 'alert();',
                    },
                    {
                        type: 'js',
                        path: 'https://.../file.js',
                    },
                    ...
                ]
            */ 
        
            return new Promise(function(_ok, _ko){
        
                var result = [];
                var checkRule = function(_ind){ 
            
                    // current rule being parsed
                    var rule = data.serializedRules[_ind];
            
                    // exit if there's no value in "rules" at index "_ind" (out of length)
                    if (!rule)
                        return _ok({rules: result, info: _info});
            
                    // skip the current rule if not enabled
                    if (!rule.enabled)
                        return checkRule(_ind+1);
            
                    // skip if the current rule can only be injected to the top-level frame 
                    if (rule.topFrameOnly && _info.parentFrameId !== -1)
                        return checkRule(_ind+1);
        
                    // skip the current rule if the tap url does not match with the rule one
                    if (!new RegExp(rule.selector).test(_info.url))
                        return checkRule(_ind+1);
        
                    // if 'path' exist then it's a rule of a file
                    if (rule.path){
            
                        // if it's a local file path
                        if (rule.local){
                            readFile(rule.path, function(_res){
            
                                if (_res.success)
                                    result.push({ type: rule.type, onLoad: rule.onLoad , code: _res.response });
                                else if (_res.message)
                                    result.push({ type: 'js', onLoad: rule.onLoad , code: 'console.error(\'Code-Injector [ERROR]:\', \''+_res.message.replace(/\\/g, '\\\\')+'\')' });
            
                                checkRule(_ind+1);
                            });
                        }
                        else{
                            result.push({ type: rule.type, onLoad: rule.onLoad, path: rule.path});
                            checkRule(_ind+1);
                        }
                    }
                    else{
                        result.push({ type: rule.type, onLoad: rule.onLoad, code: rule.code});
                        checkRule(_ind+1);
                    }
                };
            
                // start to check rules
                checkRule(0);
            });
        },
        loadFromStorage: function(){
            
            // get the rules list to the storage
            return browser.storage.local.get()
            .then(function(_data){
                
                if (_data.rules){
                    data.setRules(_data.rules);
                }
            });
        },
        saveToStorage: function(){
            
            // save the new rules list to the storage
            browser.storage.local.set({ rules: data.rules });
        },
        init: function(){

            data.loadFromStorage()
            .then(function(){
                browser.storage.onChanged.addListener(data.storageChangedHandler);
                data.events.onInit();
            });
        }
    };

    return Object.assign(new function RuleStructure(){}, {
        add: function(_rule){
            return data.add(_rule);
        },
        empty: function(){
            data.rules.length = 0;
            data.serializedRules = 0;
            
            return data.saveToStorage();
        },
        serialize: function(_rules){
            return data.serialize(_rules);
        },
        getInvolvedRules: function(_info){
            return data.getInvolvedRules(_info);
        },
        loadFromStorage: function(){
            return data.loadFromStorage();
        },
        saveToStorage: function(){
            return data.saveToStorage();
        },
        onChanged: function(_callback) {
            if (typeof _callback === 'function') {
                data.onChange = _callback;
            }
        },
        onInit: function(_callback) {
            if (typeof _callback === 'function') {
                data.onInit = _callback;
            }
        }
    });
}());







/*
function Rule(_rule){

    if (this === window) throw 'must be called with "new"';

    var self = this;
    var rule = defineRuleStructure(_rule);

    var containsCode = function(_type){
        if (rule.code[_type])
            return !!rule.code[_type].replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*|<!--[\s\S]*?-->$/gm, '').trim();
        else    
            throw 'CODE_TYPE_NOTFOUND' + '[' + _type + ']';
    }

    self.hasJSCode =  function(){
        return containsCode('js');
    }
    self.hasCSSCode =  function(){
        return containsCode('css');
    }
    self.hasHTMLCode =  function(){
        return containsCode('html');
    }
    self.hasFiles =  function(){
        return containsCode('html');
    }

    self.getData = function(){
        return rule;
    }

    return self;
}
*/