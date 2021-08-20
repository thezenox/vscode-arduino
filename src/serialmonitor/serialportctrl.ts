// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ChildProcess, execFileSync, spawn  } from "child_process";
import * as os from "os";
import * as path from "path";
import { OutputChannel } from "vscode";
import { DeviceContext } from "../deviceContext";

interface ISerialPortDetail {
  port: string;
  desc: string;
  hwid: string;
//   vendorId: string;
//   productId: string;
}

export class SerialPortCtrl {

  public static list(): Promise<ISerialPortDetail[]> {
    // TODO: Wrap this in a try catch block, catch error if no serial monitor at path
    const stdout =  execFileSync(SerialPortCtrl._serialCliPath, ["list-ports"]);
    const lists = JSON.parse(stdout);
    return lists;
  }

  private static get _serialCliPath(): string {
    let fileName: string;
    if (os.platform() === "win32") {
        fileName = "main.exe"
    } else if (os.platform() === "linux" || os.platform() === "darwin") {
        fileName = "main"
    }
    const deviceContext = DeviceContext.getInstance();
    return path.resolve(deviceContext.extensionPath, "out", "serial-monitor-cli", `${os.platform}`, fileName);
  }

  private _child: ChildProcess;
  private _currentPort: string;
  private _currentBaudRate: number;
  private _currentSerialPort = null;

  public constructor(port: string, baudRate: number, private _outputChannel: OutputChannel) {
    this._currentBaudRate = baudRate;
    this._currentPort = port;
  }

  /*
  * Return true if child proccess is currently running
  */
  public get isActive(): boolean {
    return this._child ? true : false;
  }

  public get currentPort(): string {
    return this._currentPort;
  }

  public open(): Promise<any> {
    this._outputChannel.appendLine(`[Starting] Opening the serial port - ${this._currentPort}`);
    this._outputChannel.show();

    if (this._child) {
        this._child.stdin.write("close\n");
    }
    this._child = spawn(SerialPortCtrl._serialCliPath,
                        ["open", this._currentPort, "-b", this._currentBaudRate.toString(), "--json"])

    return new Promise((resolve, reject) => {
        this._child.on("error", (err) => {
            reject(err)
        });

        this._child.stdout.on("data", (data) => {
            const jsonObj = JSON.parse(data.toString())
            this._outputChannel.append(jsonObj["payload"] + "\n");
        });
        resolve(true);
     });
  }

  public sendMessage(text: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!text || !this._currentSerialPort || !this.isActive) {
        resolve(false);
        return;
      }

      this._currentSerialPort.write(text + "\r\n", (error) => {
        if (!error) {
          resolve(true);
        } else {
          return reject(error);
        }
      });
    });
  }

  public changePort(newPort: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (newPort === this._currentPort) {
        resolve(true);
        return;
      }
      this._currentPort = newPort;
      if (!this._currentSerialPort || !this.isActive) {
        resolve(false);
        return;
      }
      this._currentSerialPort.close((err) => {
        if (err) {
          reject(err);
        } else {
          this._currentSerialPort = null;
          resolve(true);
        }
      });
    });
  }

  public stop(): Promise<any> {
    this._child.stdin.write('{"cmd": "close"}\n');
    return new Promise((resolve, reject) => {
      if (!this.isActive) {
        resolve(false);
        return;
      }
      try {
        this._child.stdin.write('{"cmd": "close"}\n');
        if (this._outputChannel) {
          this._outputChannel.appendLine(`[Done] Closed the serial port ${os.EOL}`);
        }
        this._child = null;
        resolve(true);
      } catch (error) {
          reject(error);
      }
      });
  }

  public changeBaudRate(newRate: number): Promise<any> {
    // this._outputChannel.appendLine(this.isActive.toString());
    return new Promise((resolve, reject) => {
      this._currentBaudRate = newRate;
      if (!this._child || !this.isActive) {
        resolve(true);
        return;
      } else {
            try {
                this.stop();
                this.open();
                resolve(true);
            } catch (error) {
                reject(error);
            }
        }
    });
  }
}
