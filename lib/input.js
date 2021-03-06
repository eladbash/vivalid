var validatorRepo = require('./validator-repo');
var stateEnum = require('./state-enum');
var ValidationState = require('./validation-state');
var constants = require('./constants');

var validInputTagNames = constants.validInputTagNames;
var keyStrokedInputTypes = constants.keyStrokedInputTypes;

/**
 * creates a new Input object wrapping around a DOM object.
 * @memberof! vivalid 
 * @class
 * @example new Input(document.getElementById('Name'), [['required',{msg: 'custom required message'}],['max',{max: 10}]])
 * @param {HTMLElement} el the DOM object to wrap. For radios and checkboxes, pass only 1 element- the class will find it's siblings with the same name attribute.
 * @param {_internal.validatorsNameOptionsTuple[]} validatorsNameOptionsTuples <b> the order matters- the input's state is the first {@link _internal.validatorsNameOptionsTuple validatorsNameOptionsTuple} that evulates to a non-valid (pending or invalid) state. </b>
 * @param {function} [onInputValidationResult] Signature of {@link _internal.onInputValidationResult onInputValidationResult}. A function to handle an input state or message change. If not passed, {@link _internal.defaultOnInputValidationResult defaultOnInputValidationResult} will be used.
 */
function Input(el, validatorsNameOptionsTuples, onInputValidationResult){

    if (validInputTagNames.indexOf(el.nodeName.toLowerCase()) === -1){
        throw 'only operates on the following html tags: ' + validInputTagNames.toString();
    }

    this.group = {};

    this.el = el;
    this.validators = buildValidators();
    this.onInputValidationResult = onInputValidationResult || defaultOnInputValidationResult;
    this.isNoneChecked = false;

    this.validationState = new ValidationState('', stateEnum.valid);
    this.validationCycle = 0;
    this.isChanged = false;

    this.elName = el.nodeName.toLowerCase();
    this.elType = el.type;
    this.isKeyed = (this.elName === 'textarea' || keyStrokedInputTypes.indexOf(this.elType) > -1);

    this.activeEventType = '';

    this._runValidatorsBounded = this.runValidators.bind(this);

    this.initListeners();

    function buildValidators(){
        var result = [];
        validatorsNameOptionsTuples.forEach(function(validatorsNameOptionsTuple){
            var validatorName = validatorsNameOptionsTuple[0];
            var validatorOptions = validatorsNameOptionsTuple[1];

            result.push(
                {
                    name: validatorName,
                    run: validatorRepo.build(validatorName,validatorOptions)
                }
            );

        });

        return result;
    }


    /** The default {@link _internal.onInputValidationResult onInputValidationResult} used when {@link vivalid.Input} is initiated without a 3rd parameter
     *  @name defaultOnInputValidationResult
     *  @function
     *  @memberof! _internal
     */
    function defaultOnInputValidationResult(el,validationsResult,validatorName,stateEnum) {

        var errorDiv;

        // for radio buttons and checkboxes:  get the last element in group by name
        if ((el.nodeName.toLowerCase() === 'input' && (el.type === 'radio' || el.type === 'checkbox' ))){

            var getAllByName = el.parentNode.querySelectorAll('input[name="'+el.name+'"]');

            el = getAllByName.item(getAllByName.length-1);
        }

        if(validationsResult.stateEnum === stateEnum.invalid){

            errorDiv = getExistingErrorDiv(el);
            if(errorDiv) {
                errorDiv.textContent = validationsResult.message;
            }
            else {
                appendNewErrorDiv(el,validationsResult.message);
            }

            el.style.borderStyle = "solid";
            el.style.borderColor = "#ff0000";
        }

        else {
            errorDiv = getExistingErrorDiv(el);
            if(errorDiv) {
                errorDiv.parentNode.removeChild(errorDiv);
                el.style.borderStyle = null;
                el.style.borderColor = null;
            }
        }

        function getExistingErrorDiv(el) {
            if (el.nextSibling.className === "vivalid-error") {
                return el.nextSibling;
            }

        }

        function appendNewErrorDiv(el,message) {
            errorDiv = document.createElement("DIV");        
            errorDiv.className = "vivalid-error";
            errorDiv.style.color = "#ff0000";
            var t = document.createTextNode(validationsResult.message); 
            errorDiv.appendChild(t);                                
            el.parentNode.insertBefore(errorDiv, el.nextSibling);
        }

    }

}

Input.prototype = (function() {

    return {
        reBindCheckedElement: reBindCheckedElement,
        triggerValidation: triggerValidation,
        runValidators: runValidators,
        changeEventType: changeEventType,
        initListeners: initListeners,
        setGroup: setGroup,
        addChangeListener: addChangeListener,
        addEventType: addEventType,
        removeActiveEventType: removeActiveEventType,
        getUpdateInputValidationResultAsync: getUpdateInputValidationResultAsync,
        updateInputValidationResult: updateInputValidationResult
    };

    // public

    function reBindCheckedElement(){

        // reBind only radio and checkbox buttons
        if (!(this.el.nodeName.toLowerCase() === 'input' && (this.el.type === 'radio' || this.el.type === 'checkbox' ))){
            return;
        }

        var checkedElement = document.querySelector('input[name="'+this.el.name+'"]:checked');
        if (checkedElement){
            this.el = checkedElement;
            this.isNoneChecked  = false;
        }
        else{
            this.isNoneChecked  = true;
        }

    }

    function triggerValidation(){
        if (this.validationCycle === 0 || this.isChanged) {
            this._runValidatorsBounded();
        }
    }

    function changeEventType(eventType) {
        if (!this.isKeyed) return;
        if (eventType === this.activeEventType) return;
        this.removeActiveEventType();
        this.addEventType(eventType);
    }

    function setGroup(value) {
        this.group = value;
    }

    function initListeners() {

        this.addChangeListener();
        if (this.isKeyed){
            this.addEventType('blur');
        }
        else {
            this.addEventType('change');
        }

    }

    function runValidators(event, fromIndex){

        this.validationCycle++;
        this.reBindCheckedElement();

        var validationsResult, validatorName;

        var i = fromIndex || 0;
        for (; i < this.validators.length; i++){
            var validator = this.validators[i];
            var elementValue = this.isNoneChecked ? '' : this.el.value;
            // if async, then return a pending enum with empty message and call the callback with result once ready
            var validatorResult = validator.run(elementValue, this.getUpdateInputValidationResultAsync(validator.name, i, this.validationCycle));
            if (validatorResult.stateEnum !== stateEnum.valid)
                {
                    validationsResult = validatorResult;
                    validatorName = validator.name;
                    this.changeEventType('input'); //TODO: call only once?
                    break;
                }

        }

        validationsResult = validationsResult || new ValidationState('', stateEnum.valid);
        this.updateInputValidationResult(validationsResult,validatorName);

        // new...
        this.isChanged = false; // TODO: move to top of function
    }

    // private

    function addChangeListener(){
        if (this.isKeyed){
            this.el.addEventListener('input', function () { this.isChanged = true;}, false);
        }

        else if (this.elName === 'input' && (this.elType === 'radio' || this.elType === 'checkbox')){

            var groupElements =  document.querySelectorAll('input[name="'+this.el.name+'"]');

            var i=0;
            for (; i <groupElements.length ; i++) {
                groupElements[i].addEventListener('change', function (){this.isChanged = true;}, false);
            }
        }

        else if(this.elName === 'select'){
            this.el.addEventListener('change', function (){this.isChanged = true;}, false);
        }
    }

    function addEventType(eventType) {
        if (this.isKeyed){
            this.el.addEventListener(eventType, this._runValidatorsBounded, false);
        }

        else if (this.elName === 'input' && (this.elType === 'radio' || this.elType === 'checkbox')){

            var groupElements =  document.querySelectorAll('input[name="'+this.el.name+'"]');

            var i=0;
            for (; i <groupElements.length ; i++) {
                groupElements[i].addEventListener(eventType, this._runValidatorsBounded, false);
            }
        }

        else if(this.elName === 'select'){
            this.el.addEventListener(eventType, this._runValidatorsBounded, false);
        }

        this.activeEventType = eventType;
    }

    function removeActiveEventType() {
        this.el.removeEventListener(this.activeEventType, this._runValidatorsBounded, false);
    }

    function getUpdateInputValidationResultAsync(validatorName, validatorIndex, asyncValidationCycle) {

        var self = this;

        return function(validatorResult){

            // guard against updating async validations from old cycles
            if(asyncValidationCycle && asyncValidationCycle !== self.validationCycle){
                return;
            }

            // if pending turned to be valid, and there are more validation to run, run them:
            if (validatorResult.stateEnum === stateEnum.valid && validatorIndex+1 < self.validators.length){
                self._runValidatorsBounded(null,validatorIndex+1);
            }

            else {
                self.updateInputValidationResult(validatorResult,validatorName);
            }
        };

    }

    function updateInputValidationResult(validationsResult,validatorName) {

        this.group.updateGroupStates(this.validationState, validationsResult); // filter equal state at caller
        this.group.updateGroupListeners();

        this.validationState = validationsResult;
        this.onInputValidationResult(this.el,validationsResult,validatorName,stateEnum);

    }

})();

module.exports = Input;

/** An Array where Array[0] is the validator {string} name, and Array[1] is the validator {object} options 
 *  @name validatorsNameOptionsTuple
 *  @type {array}
 *  @memberof! _internal
 *  @example ['required',{msg: 'custom required message'}]
 */

/** A function to handle an input state or message change
 *  @name onInputValidationResult
 *  @function
 *  @memberof! _internal
 *  @param {HTMLElement} el the input's DOM object.
 *  @param {object} validationsResult A {@link _internal.ValidationState ValidationState} instance containing the state and validation message.
 *  @param {string} validatorName The name of validator that triggered an 'invalid' state.
 *  @param {object} stateEnum {@link _internal.stateEnum stateEnum}
 */
