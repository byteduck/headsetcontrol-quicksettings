/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
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
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

let BATTERY_CMD = "/usr/bin/env headsetcontrol -cb"
let CHECK_INTERVAL = 60;   // 1m


function LOG(l) {
	console.log("HeadsetControl:", l);
}

function ERR(l) {
	console.log("HeadsetControl:", l);
}

function battery_icon_name(pct) {
		var icon = "battery-missing-symbolic";
		if (typeof pct == "number" && pct != -1 && !isNaN(pct)) {
			let closestPct = Math.floor(pct / 10) * 10;
			icon = "battery-level-" + closestPct + "-symbolic";
		}
		return icon;
}

const HeadsetToggleMenu = GObject.registerClass(
class HeadsetToggleMenu extends QuickSettings.QuickMenuToggle {
    _init() {
		super._init({
			title: _("Headset"),
			toggleMode: false
		});
		
    }

	set_battery(pct) {
		this.icon_name = battery_icon_name(pct);
		this.menu.setHeader("audio-headset-symbolic", _("Headset Control"), "Headset battery: " + pct + "%");
	}

});

const HeadsetBatteryIndicator = GObject.registerClass(
	class HeadsetBatteryIndicator extends QuickSettings.QuickSettingsItem {
		_init() {
			super._init({
				style_class: "icon-button headset-button",
				hasMenu: false,
				canFocus: true,
			});
 
			this._container = new St.BoxLayout({
                style_class: '',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
                vertical: false,
            });

			this._icon = new St.Icon({
				style_class: "headset-icon",
				icon_name: "audio-headset-symbolic"
			});
			this._container.add_child(this._icon);

			this._label = new St.Label({
				text: "100%",
				y_align: Clutter.ActorAlign.CENTER
			});
			this._container.add_child(this._label);
			this.set_child(this._container);

            this.set_y_align(Clutter.ActorAlign.CENTER);

			this._batteryPct = -1;

			let self = this;
			this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, CHECK_INTERVAL, function () {
				self._update();
				return true;
			});
			this._update();
		}
		
		_updateBatteryIcon() {
			//this.icon_name = "audio-headset-symbolic";
			this._label.set_text(this._batteryPct + "%");
		}

		_update() {
			this._updateBattery();
		}

		_updateBattery() {
			if (this._batteryPid) {
				// Already checking!
				return;
			}
			try {
				this._batteryPct = -1;
				// Parse check command line
				let [parseok, argvp] = GLib.shell_parse_argv( BATTERY_CMD );
				if (!parseok) { throw 'Parse error' };
				let [res, pid, in_fd, out_fd, err_fd]  = GLib.spawn_async_with_pipes(null, argvp, null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
				// Let's buffer the command's output - that's a input for us !
				this._batteryStream = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: out_fd})
				});
				// We will process the output at once when it's done
				this._batterySourceId = GLib.child_watch_add(0, pid, () => {this._checkBattery()} );
				this._batteryPid = pid;
				LOG("Launched battery check process")
			} catch (err) {
				this._errorString = err.message.toString();
				LOG("Battery update error: " + this._errorString);
				this._updateBatteryIcon();
			}
		}

		_checkBattery() {
			try {
				let batteryStr = this._batteryStream.read_line_utf8(null);
				this._batteryPct = parseInt(batteryStr);

				this._batteryStream.close(null);
				this._batteryStream = null;

				GLib.source_remove(this._batterySourceId);
				this._batterySourceId = null;
				this._batteryPid = null;
			} catch(err) {
				this._errorString = err.message.toString();
				LOG("Battery check error: " + this._errorString);
			}

			this._updateBatteryIcon();
		}
	});

export default class HeadsetControlExtension extends Extension {
	enable() {
		this._indicator = new HeadsetBatteryIndicator();
		const QuickSettingsMenu = Main.panel.statusArea.quickSettings;
		const QuickSettingsActions = QuickSettingsMenu._system._systemItem.child;
		QuickSettingsActions.insert_child_at_index(this._indicator, 4);
	}

	disable() {
		// this._indicator.quickSettingsItems.forEach(item => item.destroy());
		this._indicator.destroy();
		this._indicator = null;
	}
}
