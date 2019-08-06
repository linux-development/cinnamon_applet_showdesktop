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
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;
const SignalManager = imports.misc.signalManager;
const GLib = imports.gi.GLib;

class ShowDesktopApplet extends Applet.TextIconApplet {

    // default methods
    
    constructor(metadata, orientation, panelHeight, instanceId) {
        // initialize applet
        super(orientation, panelHeight, instanceId);
        // call handler
        this.handleInit(metadata, orientation, instanceId);
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
    
    handleInit(metadata, orientation, instanceId) {
        try {
            // configure applet
            Gtk.IconTheme.get_default().append_search_path(metadata.path);
            this.setAllowedLayout(Applet.AllowedLayout.BOTH);
            // bind settings
            this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
            this.settings.bind("showIcon", "showIcon", this.handleSettings);
            this.settings.bind("iconName", "iconName", this.handleSettings);
            this.settings.bind("borderPlacement", "borderPlacement", this.handleSettings);
            this.settings.bind("buttonWidth", "buttonWidth", this.handleSettings);
            this.settings.bind("middleClickAction", "middleClickAction", null);
            this.settings.bind("enablePeek", "enablePeek", this.handleSettings);
            this.settings.bind("peekOpacity", "peekOpacity", null);
            this.settings.bind("blur", "blur", this.handleSettings);
            this.settings.bind("opacifyDesklets", "opacifyDesklets", null);
            // connect events
            this.actor.connect("enter-event", Lang.bind(this, this.handleMouseEnter));
            this.actor.connect("leave-event", Lang.bind(this, this.handleMouseLeave));        
            this.actor.connect("scroll-event", Lang.bind(this, this.handleScroll));
            // connect signals
            this.signals = new SignalManager.SignalManager(null);
            this.signals.connect(global.stage, "notify::key-focus", Lang.bind(this, this.handleMouseEnter));
            // set default values
            this.peekPerformed = false;
            this.peekTimeoutId = null;
            this.styleClassBackup = this.actor.styleClass;
            // set orientation and apply settings
            this.handleOrientation(orientation);
        } catch (e) {
            global.logError(e);
        }
    }

    handleOrientation(orientation) {
        this.orientation = orientation;
        this.handleSettings();
    }

    handleSettings() {
        // apply icon
        if (this.showIcon) {
            const iconFile = Gio.File.new_for_path(this.iconName);
            if (iconFile.query_exists(null)) {
               this.set_applet_icon_path(this.iconName);
            } else {
               this.set_applet_icon_name(this.iconName);
            }
        } else {
            this.hide_applet_icon();
        }
        // apply width
        if (this.orientation === St.Side.TOP || this.orientation === St.Side.BOTTOM) {
            this.actor.width = this.buttonWidth;
        } else {
            this.actor.height = this.buttonWidth;
        }
        // apply styles
        this.updateStyles();
        // if blur or peek is disabled, check windows to remove blur effect
        if (!this.enablePeek || !this.blur) {
            this.clearWindowsBlur();
        }
    }

    handleButtonPressEvent(event) {
        if (!this.isPanelEditModeEnabled()) {
            // remove peek if any button is pressed
            this.resetPeek(0);
            // do action
            switch (event.get_button()) {
                // for left button click
                case 1:
                    // hide/show all windows
                    global.screen.toggle_desktop(global.get_current_time());
                    break;
                // for middle button click
                case 2:
                    if (this.middleClickAction === "expo") {
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

    handleMouseEnter(event) {
        if (!this.isPanelEditModeEnabled() && this.enablePeek) {
            this.clearPeekTimeout();
            this.peekTimeoutId = setTimeout(() => {
                if (this.actor.hover &&
                        !this._applet_context_menu.isOpen) {
                    this.peekPerformed = true;
                    this.addWindowsOpacity(0.3);
                }
            }, 500);
        }
    }

    handleMouseLeave(event) {
        this.resetPeek(0.2);
    }

    handleScroll(actor, event) {
        if (!this.isPanelEditModeEnabled()) {
            //switch workspace
            const index = global.screen.get_active_workspace_index() + event.get_scroll_direction() * 2 - 1;
            if (global.screen.get_workspace_by_index(index) !== null) {
                this.resetPeek(0);
                global.screen.get_workspace_by_index(index).activate(global.get_current_time());
            }
        }
    }

    handleRemoveFromPanel() {
        this.resetPeek(0);
        this.clearWindowsBlur();
        this.settings.finalize();
        this.signals.disconnectAllSignals();
    }

    // custom methods

    updateStyles() {
        this.actor.styleClass = this.styleClassBackup + " showdesktop-applet " + (
            this.borderPlacement && this.borderPlacement !== "none" ?
            "showdesktop-applet_border-" + this.borderPlacement:
            ""
        );
    }

    resetPeek(time) {
        this.clearPeekTimeout();
        if (this.peekPerformed) {
            this.removeWindowsOpacity(time);
            this.peekPerformed = false;
        }
    }

    clearPeekTimeout() {
        if (this.peekTimeoutId && !this.peekPerformed) {
            clearTimeout(this.peekTimeoutId);
        }
        this.peekTimeoutId = null;
    }

    addWindowsOpacity(time) {
        // add blur if enabled
        if (this.blur) {
            for (let window of global.get_window_actors()) {
                // don't add blur to icons on the desktop
                if (window.meta_window.get_title() !== "Desktop") {     
                    if (!window.showDesktopBlurEffect) {
                        window.showDesktopBlurEffect = new Clutter.BlurEffect();
                    }
                    window.add_effect_with_name("blur", window.showDesktopBlurEffect);
                }
            }
        }
        // set opacity         
        this.setWindowsOpacity(255 - (255/100 * this.peekOpacity), time);
    }

    removeWindowsOpacity(time) {
        // set opacity
        this.setWindowsOpacity(255, time);        
        // remove blur if enabled
        if (this.blur) {
            for (let window of global.get_window_actors()) {         
                if (window.showDesktopBlurEffect) {
                    window.remove_effect(window.showDesktopBlurEffect);
                }
            }
        }
    }
    
    setWindowsOpacity(opacity, time) {
        const params = {
            "opacity": opacity,
            "time": time,
            "transition": "easeOutSine"
        };
        Tweener.addTween(global.window_group, params);
        if (this.opacifyDesklets) {
            Tweener.addTween(Main.deskletContainer.actor, params);
        }
    }

    clearWindowsBlur() {
        for (let window of global.get_window_actors()) {         
            if (window.showDesktopBlurEffect) {
                window.showDesktopBlurEffect = null;
            }
        }
    }

    isPanelEditModeEnabled() {
        return global.settings.get_boolean("panel-edit-mode");
    }

};

function main(metadata, orientation, panelHeight, instanceId) {
    return new ShowDesktopApplet(metadata, orientation, panelHeight, instanceId);
}
