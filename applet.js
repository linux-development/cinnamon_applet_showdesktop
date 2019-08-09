/*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* This code is based on Show desktop ++ applet by mohammad-sn.
*/

const Applet = imports.ui.applet;
const St = imports.gi.St;
const Settings = imports.ui.settings;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const SignalManager = imports.misc.signalManager;

class ShowDesktopApplet extends Applet.TextIconApplet {

    // standard methods
    
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this.handleInit(metadata, orientation);
    }
    
    on_applet_removed_from_panel() {
        this.handleRemoveFromPanel();
    }

    on_orientation_changed(orientation) {
        this.handleOrientation(orientation);
    }

    _onButtonPressEvent(actor, event) {
        this.handleButtonPressEvent(event);
        return Applet.Applet.prototype._onButtonPressEvent.call(this, actor, event);
    }
    
    // custom handlers
    
    handleInit(metadata, orientation) {
        try {
            // configure applet
            this.setAllowedLayout(Applet.AllowedLayout.BOTH);
            // create state and set default values
            this.state = {
                'peekPerformed': false,
                'peekTimeoutId': null,
                'styleClassBackup': this.actor.styleClass,
                'orientation': orientation
            };
            // create a storage for settings with a list of keys
            this.settings = {
                'showIcon': false,
                'iconName': null,
                'borderPlacement': null,
                'buttonWidth': 0,
                'middleClickAction': null,
                'enablePeek': false,
                'peekDelay': 0,
                'peekOpacity': 0,
                'enableBlur': false,
                'opacifyDesklets': false
            };
            // bind settings
            this.appletSettings = new Settings.AppletSettings(this.settings, metadata.uuid, this.instance_id);
            for (let key in this.settings) {
                this.appletSettings.bind(key, key, () => this.handleSettings());
            }           
            // connect signals
            this.signalManager = new SignalManager.SignalManager(null);
            this.signalManager.connect(global.stage, 'notify::key-focus', () => this.handleMouseLeave());
            // connect events
            this.actor.connect('enter-event', () => this.handleMouseEnter());
            this.actor.connect('leave-event', () => this.handleMouseLeave());        
            this.actor.connect('scroll-event', (...args) => this.handleScroll(...args));
            // apply settings
            this.handleSettings();
        } catch (e) {
            global.logError(e);
        }
    }

    handleSettings() {
        // apply icon
        if (this.settings.showIcon) {
            const iconFile = Gio.File.new_for_path(this.settings.iconName);
            if (iconFile.query_exists(null)) {
               this.set_applet_icon_path(this.settings.iconName);
            } else {
               this.set_applet_icon_name(this.settings.iconName);
            }
        } else {
            this.hide_applet_icon();
        }
        // apply width
        this.updateSize();
        // apply styles
        this.updateStyles();
        // if blur or peek is disabled, check if need to remove blur effect from windows 
        if (!this.settings.enablePeek || !this.settings.enableBlur) {
            this.clearWindowsBlur();
        }
    }

    handleOrientation(orientation) {
        this.state.orientation = orientation;
        this.updateSize();
        this.updateStyles();
    }

    handleButtonPressEvent(event) {
        if (!this.isPanelEditModeEnabled()) {
            // remove peek if any button is pressed
            this.resetPeek(0);
            // do action
            switch (event.get_button()) {
                // for left button click
                case 1:
                    // hide or show all windows
                    global.screen.toggle_desktop(global.get_current_time());
                    break;
                // for middle button click
                case 2:
                    if (this.settings.middleClickAction === 'expo') {
                        if (!Main.expo.animationInProgress) {
                            Main.expo.toggle();
                        }
                    } else {
                        if (!Main.overview.animationInProgress) {
                            Main.overview.toggle();
                        }
                    }
                    break;
            }
        }
    }

    handleMouseEnter() {
        this.updateTooltip();
        if (!this.isPanelEditModeEnabled() && this.settings.enablePeek) {
            this.clearPeekTimeout();
            this.state.peekTimeoutId = setTimeout(() => {
                if (this.actor.hover && !this._applet_context_menu.isOpen) {
                    this.state.peekPerformed = true;
                    this.addWindowsOpacity(0.3);
                }
            }, this.settings.peekDelay);
        }
    }

    handleMouseLeave() {
        this.resetPeek(0.2);
    }

    handleScroll(actor, event) {
        if (!this.isPanelEditModeEnabled()) {
            // switch workspace
            const index = global.screen.get_active_workspace_index() + event.get_scroll_direction() * 2 - 1;
            if (global.screen.get_workspace_by_index(index)) {
                this.resetPeek(0);
                global.screen.get_workspace_by_index(index).activate(global.get_current_time());
                this.updateTooltip();
            }
        }
    }

    handleRemoveFromPanel() {
        try {
            this.resetPeek(0);
            this.clearWindowsBlur();
            this.appletSettings.finalize();
            this.signalManager.disconnectAllSignals();
        } catch (e) {
            global.logError(e);
        }
    }

    // custom methods

    updateSize() {
        if (this.isHorizontal()) {
            this.actor.width = this.settings.buttonWidth;
        } else {
            this.actor.height = this.settings.buttonWidth;
        } 
    }

    updateStyles() {
        // restore initial styles classes from the backup
        this.actor.styleClass = this.state.styleClassBackup;
        // add applet style class
        this.actor.add_style_class_name('showdesktop-applet');
        // add border style classes
        if (this.settings.borderPlacement === 'before' || this.settings.borderPlacement === 'both') {
            if (this.isHorizontal()) {
                this.actor.add_style_class_name('showdesktop-applet_border-left');
            } else {
                this.actor.add_style_class_name('showdesktop-applet_border-top');
            }
        }
        if (this.settings.borderPlacement === 'after' || this.settings.borderPlacement === 'both') {
            if (this.isHorizontal()) {
                this.actor.add_style_class_name('showdesktop-applet_border-right');
            } else {
                this.actor.add_style_class_name('showdesktop-applet_border-bottom');
            }
        }
    }

    updateTooltip() {
        this.set_applet_tooltip(Main.getWorkspaceName(global.screen.get_active_workspace_index()));
    }

    resetPeek(time) {
        this.clearPeekTimeout();
        if (this.state.peekPerformed) {
            this.removeWindowsOpacity(time);
            this.state.peekPerformed = false;
        }
    }

    clearPeekTimeout() {
        if (this.state.peekTimeoutId && !this.state.peekPerformed) {
            clearTimeout(this.state.peekTimeoutId);
        }
        this.state.peekTimeoutId = null;
    }

    addWindowsOpacity(time) {
        if (this.settings.enableBlur) {
            let windowActors = global.get_window_actors();
            // using classic FOR loop as it's just faster than modern loops, don't change!
            for (let i = 0, length = windowActors.length; i < length; i++) {
                let window = windowActors[i];
                // no need to add blur to icons on the desktop
                if (window.meta_window.get_title() !== 'Desktop') {     
                    if (!window.showDesktopBlurEffect) {
                        window.showDesktopBlurEffect = new Clutter.BlurEffect();
                    }
                    window.add_effect_with_name('blur', window.showDesktopBlurEffect);
                }
            }
        }        
        this.setWindowsOpacity(255 - (255/100 * this.settings.peekOpacity), time);
    }

    removeWindowsOpacity(time) {
        this.setWindowsOpacity(255, time);        
        if (this.settings.enableBlur) {
            let windowActors = global.get_window_actors();
            // using classic FOR loop as it's just faster than modern loops, don't change!
            for (let i = 0, length = windowActors.length; i < length; i++) {
                let window = windowActors[i];      
                if (window.showDesktopBlurEffect) {
                    window.remove_effect(window.showDesktopBlurEffect);
                }
            }
        }
    }
    
    setWindowsOpacity(opacity, time) {
        const params = {
            'opacity': opacity,
            'time': time,
            'transition': 'easeOutSine'
        };
        Tweener.addTween(global.window_group, params);
        if (this.settings.opacifyDesklets) {
            Tweener.addTween(Main.deskletContainer.actor, params);
        }
    }

    clearWindowsBlur() {
        let windowActors = global.get_window_actors();
        // using classic FOR loop as it's just faster than modern loops, don't change!
        for (let i = 0, length = windowActors.length; i < length; i++) {
            let window = windowActors[i];      
            if (window.showDesktopBlurEffect) {
                window.showDesktopBlurEffect = null;
            }
        }
    }

    isHorizontal() {
        return this.state.orientation === St.Side.TOP || this.state.orientation === St.Side.BOTTOM;
    }

    isPanelEditModeEnabled() {
        return global.settings.get_boolean('panel-edit-mode');
    }

};

function main(metadata, orientation, panelHeight, instanceId) {
    return new ShowDesktopApplet(metadata, orientation, panelHeight, instanceId);
}