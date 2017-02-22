/// <reference path="../../typings/index.d.ts" />

import * as _ from "underscore";
import * as THREE from "three";
import * as rbush from "rbush";

import {Observable} from "rxjs/Observable";
import {Subscription} from "rxjs/Subscription";
import {Subject} from "rxjs/Subject";

import "rxjs/add/observable/combineLatest";

import "rxjs/add/operator/distinctUntilChanged";
import "rxjs/add/operator/filter";
import "rxjs/add/operator/map";
import "rxjs/add/operator/publishReplay";
import "rxjs/add/operator/scan";
import "rxjs/add/operator/switchMap";

import {
    IMarkerConfiguration,
    IMarkerOptions,
    ISpatialMarker,
    Marker,
    ComponentService,
    Component,
    SimpleMarker,
} from "../Component";
import {IFrame} from "../State";
import {Container, Navigator} from "../Viewer";
import {IGLRenderHash, GLRenderStage} from "../Render";
import {Node} from "../Graph";
import {GeoCoords, ILatLonAlt} from "../Geo";


export class SpatialDataComponent extends Component<IMarkerConfiguration> {
    public static componentName: string = "spatialData";

    private _disposable: Subscription;

    private _scene: THREE.Scene;

    constructor(name: string, container: Container, navigator: Navigator) {
        super(name, container, navigator);
        console.log('constructing')
    }

    protected _activate(): void {
        console.log('activating')
        this._setUpScene();

        this._disposable = Observable
            .combineLatest(
                [
                    this._navigator.stateService.currentState$,
                ])
            .distinctUntilChanged(
                undefined,
                ([frame]: [IFrame]): number => {
                    return frame.id;
                })
            .map(
                ([frame]: [IFrame]): IGLRenderHash => {
                    return this._renderHash(frame);
                })
            .subscribe(this._container.glRenderer.render$);
    }

    protected _deactivate(): void {
        // release memory
        this._disposeScene();
        this._disposable.unsubscribe();
    }

    protected _getDefaultConfiguration(): IMarkerConfiguration {
        return {};
    }

    private _renderHash(frame: IFrame): IGLRenderHash {
        // determine if render is needed while updating scene
        // specific properies.
        let needsRender: boolean = this._updateScene(frame);

        // return render hash with render function and
        // render in foreground.
        return {
            name: this._name,
            render: {
                frameId: frame.id,
                needsRender: needsRender,
                render: this._render.bind(this),
                stage: GLRenderStage.Foreground,
            },
        };
    }

    private _updateScene(frame: IFrame): boolean {
        if (!frame ||
            !frame.state.currentNode) {
            return false;
        }

        let needRender: boolean = false;
        let node: Node = frame.state.currentNode;

        return needRender;
    }

    private _render(
        perspectiveCamera: THREE.PerspectiveCamera,
        renderer: THREE.WebGLRenderer): void {

        renderer.render(this._scene, perspectiveCamera);
    }

    private _setUpScene(): void {
        this._scene = new THREE.Scene();
        this._scene.add(this._createGrid());
    }

    private _createGrid(): THREE.Object3D {
        let linegeo: THREE.Geometry = new THREE.Geometry();
        let N: number = 20;
        let scale: number = 2;
        for (let i: number = 0; i <= 2 * N; ++i) {
            linegeo.vertices.push(
                new THREE.Vector3(scale * (i - N), scale * (-N), 0),
                new THREE.Vector3(scale * (i - N), scale * ( N), 0),
                new THREE.Vector3(scale * (-N), scale * (i - N), 0),
                new THREE.Vector3(scale * ( N), scale * (i - N), 0)
            );
        }
        let lineMaterial: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({color: 0x555555});
        let line: THREE.Line = new THREE.Line(linegeo, lineMaterial, THREE.LinePieces);

        let group: THREE.Object3D = new THREE.Object3D();
        group.add(line);
        return group;
    }

    private _disposeObject(object: THREE.Object3D): void {
        this._scene.remove(object);
        for (let i: number = 0; i < object.children.length; ++i) {
            let c: THREE.Mesh = <THREE.Mesh> object.children[i];
            c.geometry.dispose();
            c.material.dispose();
        }
    }

    private _disposeScene(): void {
    }
}

ComponentService.register(SpatialDataComponent);
export default SpatialDataComponent;
