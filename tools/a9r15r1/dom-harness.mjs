// Minimal test DOM port. Native Option/select semantics needed by the existing
// orchestration harnesses; independently compared with Chromium in dom-oracle.
export class TestClassList {
    constructor(...names) { this.names = new Set(names); }
    contains(name) { return this.names.has(name); }
    add(...names) { names.forEach(name => this.names.add(name)); }
    remove(...names) { names.forEach(name => this.names.delete(name)); }
}
export class TestOption {
    constructor(text = '', value, defaultSelected = false, selected = false) {
        this._text = String(text);this._value = value === undefined ? null : String(value);
        this.defaultSelected = Boolean(defaultSelected);this._selected = Boolean(selected);
        this.disabled = false;this.parentElement = null;
    }
    get text() { return this._text; }
    set text(value) { this._text = String(value); }
    get textContent() { return this.text; }
    set textContent(value) { this.text = value; }
    get value() { return this._value === null ? this.text : this._value; }
    set value(value) { this._value = String(value); }
    get selected() { return this._selected; }
    set selected(value) {
        this._selected = Boolean(value);
        if (this._selected && this.parentElement) for (const option of this.parentElement.options) if (option !== this) option._selected = false;
    }
}
export class TestElement {
    constructor(id, tagName = 'DIV') {
        this.id = id;this.tagName = tagName;this._value = '';this._html = '';this._text = '';
        this.checked = false;this.hidden = false;this.disabled = false;this.dataset = {};
        this.style = {display:'',removeProperty(name) {delete this[name];}};
        this.classList = new TestClassList();this.children = [];this._events = new Map();
    }
    get value() {return this._value;}
    set value(value) {this._value = String(value);}
    get innerHTML() {return this._html;}
    set innerHTML(value) {this._html = String(value);this.children = [];}
    get textContent() {return this._text;}
    set textContent(value) {this._text = String(value);}
    addEventListener(type, listener) {const list=this._events.get(type)||[];list.push(listener);this._events.set(type,list);}
    dispatchEvent(event) {for(const listener of this._events.get(event.type)||[])listener.call(this,event);return true;}
    querySelector() {return null;}
    closest() {return null;}
    replaceChildren(...children) {this.children = children;this._html = '';}
    append(...children) {this.children.push(...children);}
    appendChild(child) {this.append(child);return child;}
    remove() {}
    setAttribute(name, value) {this[name] = String(value);}
}
export class TestSelect extends TestElement {
    constructor(id) {super(id,'SELECT');this._options = [];}
    get options() {return this._options;}
    get selectedIndex() {return this.options.findIndex(option=>option.selected);}
    set selectedIndex(index) {this.options.forEach((option,i)=>{option._selected=i===Number(index);});}
    get value() {return this.options.find(option=>option.selected)?.value || '';}
    set value(value) {const index=this.options.findIndex(option=>option.value===String(value));this.selectedIndex=index;}
    add(option, before) {
        if (!(option instanceof TestOption)) throw new TypeError('Select accepts an Option');
        const index=typeof before==='number'?before:this.options.indexOf(before);
        option.parentElement=this;
        if(index>=0&&index<this.options.length)this.options.splice(index,0,option);else this.options.push(option);
        if(option.selected)this.options.forEach(other=>{if(other!==option)other._selected=false;});
        else if(this.selectedIndex<0)this.selectedIndex=0;
    }
    replaceChildren(...options) {for(const option of this.options)option.parentElement=null;this._options=[];for(const option of options)this.add(option);}
    append(...options) {for(const option of options)this.add(option);}
    appendChild(option) {this.add(option);return option;}
    get innerHTML() {return this.options.map(option=>'<option value="'+option.value+'">'+option.text+'</option>').join('');}
    set innerHTML(value) {
        this.replaceChildren();
        for(const match of String(value).matchAll(/<option\b[^>]*value=["']([^"']*)["'][^>]*>([^<]*)<\/option>/g))this.add(new TestOption(match[2],match[1]));
    }
}
// Bootstrap selections explicitly model the filter controls that the app
// normally mounts from branch settings. They do not derive expected outcomes.
export function fixtureElement(id) {
    const choices = id === 'att_shift' ? ['']
        : id === 'shift_branch' ? ['',...Array.from({length:10},(_,i)=>'CS'+(i+1))]
        : /^(att_branch|att_month_branch)$/.test(id) ? ['all',...Array.from({length:10},(_,i)=>'CS'+(i+1))]
        : id === 'att_belt' ? ['all','Đen','Đai Đen','Đai Xanh'] : null;
    if (!choices) return new TestElement(id);
    const element=new TestSelect(id);for(const value of choices)element.add(new TestOption(value,value));return element;
}
export function installOption(global) {global.Option=TestOption;}
