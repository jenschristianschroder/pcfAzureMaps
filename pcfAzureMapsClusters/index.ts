import {IInputs, IOutputs} from "./generated/ManifestTypes";
import DataSetInterfaces = ComponentFramework.PropertyHelper.DataSetApi;
import * as atlas from "azure-maps-control";
import { TrafficControl } from "./TrafficControl";

type DataSet = ComponentFramework.PropertyTypes.DataSet;

export class pcfAzureMapsClusters implements ComponentFramework.StandardControl<IInputs, IOutputs> {
	private featureCollection: atlas.data.FeatureCollection;
	private feature: atlas.data.Feature<atlas.data.Geometry, Coordinates>;

	private map : atlas.Map;
	private _mapContainer: HTMLDivElement;

	private datasource:  atlas.source.DataSource;
	private popup: atlas.Popup;
	/**
	 * Empty constructor.
	 */
	constructor()
	{

	}

	/**
	 * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
	 * Data-set values are not initialized here, use updateView.
	 * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
	 * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
	 * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
	 * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
	 */
	public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, state: ComponentFramework.Dictionary, container:HTMLDivElement)
	{
		let _map: atlas.Map;
		this._mapContainer = document.createElement('div');
		this._mapContainer.setAttribute("id", "map");
		this._mapContainer.setAttribute("style", "position:relative;width:100%;min-width:290px;height:100%;");

		container.append(this._mapContainer);
		
		//URL to custom endpoint to fetch Access token
		var url = 'https://adtokens.azurewebsites.net/api/HttpTrigger1?code=dv9Xz4tZQthdufbocOV9RLaaUhQoegXQJSeQQckm6DZyG/1ymppSoQ==';

		//Initialize a map instance.
		_map = new atlas.Map('map', {
			view: "Auto",
			center: [12.56,55.69],
			zoom: 10,
			//Add your Azure Maps subscription client ID to the map SDK. Get an Azure Maps client ID at https://azure.com/maps
			authOptions: {
				authType: atlas.AuthenticationType.subscriptionKey,
				subscriptionKey: 'mPZlcjSeoBPiq-QWziggZpTwTwK4DVC_NAiF3l0OwDw'
			},
			enableAccessibility: false,
		});

		_map.events.add('ready', function(this: pcfAzureMapsClusters) {
			
			_map.controls.add([
					new atlas.control.ZoomControl(), 
					new atlas.control.StyleControl(), 
					new TrafficControl({style: 'auto'})
				], 
				{position: atlas.ControlPosition.TopRight
			});		

			
		});
		this.map = _map;


		this.featureCollection = 
		{
			"type": "FeatureCollection",
			"features": []
		};
	}


	/**
	 * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
	 * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
	 */
	public updateView(context: ComponentFramework.Context<IInputs>): void
	{
		if(context.parameters.dataSet.loading) {
			return;
		}

		if (context.parameters.dataSet.paging.hasNextPage) {
			context.parameters.dataSet.paging.loadNextPage();
		}
		else {
			let _map: atlas.Map;
			_map = this.map;

		
			let _locations = context.parameters.dataSet;
			for(let _locationId of _locations.sortedRecordIds) 
			{
				let _longitude = _locations.records[_locationId].getValue("ts_laengdegrad") != null ? _locations.records[_locationId].getFormattedValue("ts_laengdegrad") : "";
				let _latitude = _locations.records[_locationId].getValue("ts_breddegrad") != null ? _locations.records[_locationId].getFormattedValue("ts_breddegrad") : "";

				if(_latitude != "" && _longitude != "") {
					const point1 = new atlas.data.Feature(new atlas.data.Point([_longitude.replace(",",".") as unknown as number, _latitude.replace(",",".") as unknown as number]), {
						"id": _locations.records[_locationId].getRecordId(),
						"name": _locations.records[_locationId].getFormattedValue("ts_lokation"),
						"anomaly": _locations.records[_locationId].getFormattedValue("ts_afvigelse") == "Ja" ? 1 : 0	
					});
					this.featureCollection.features.push(point1);
				}
			}

			if(_locations.paging.hasNextPage)
				_locations.paging.loadNextPage(); //load next page of records
			
			//Create a data source and add it to the map.
			let datasource = new atlas.source.DataSource("ds0", {
				cluster: true,

				//The radius in pixels to cluster points together.
				clusterRadius: 80,
				
				
				clusterProperties: {
					// @ts-ignore
					anomaly: ['+',['get', 'anomaly']],
					// @ts-ignore
					normal: ['+',['get', 'anomaly']]
				}
			});
		

			_map.sources.add(datasource);

			//Create a bubble layer for rendering clustered data points.
			let clusterBubbleLayer = new atlas.layer.BubbleLayer(datasource, "bl0", {
				//Scale the size of the clustered bubble based on the number of points inthe cluster.
				radius: [
				'step',
				['get', 'point_count'],
				20,         //Default of 20 pixel radius.
				50, 30,    //If point_count >= 100, radius is 30 pixels.
				100, 40     //If point_count >= 750, radius is 40 pixels.
				],
				color: [
					'case',
					['==', ['get', 'anomaly'], ['get', 'point_count']],
					'rgba(255,0,0,0.8)',	//Has one or more anomaly
					'rgba(0,170,80,0.8)' //Has no anomaly
				],				
				strokeWidth: 5,/* ['*', ['/', ['get','anomaly'],['get','point_count']], 50], */
				strokeColor: ['case',
					['>', ['get', 'anomaly'], 0], 'red',
					'white'
				],
				filter: ['has', 'point_count'] //Only rendered data points which have a point_count property, which clusters do

			});

			_map.imageSprite.createFromTemplate('marker-green', 'marker', 'green', '#fff');
			_map.imageSprite.createFromTemplate('red-circle', 'pin-round', 'red', 'rgba(0,0,0,0)');

			//Create a symbol layer to render the count of locations in a cluster.
			let clusterSymbolLayer = new atlas.layer.SymbolLayer(datasource, "sl0", {
				iconOptions: {
					image: 'none'
				},
				textOptions: {
					textField: ['concat', ['to-string', ['get', 'point_count_abbreviated']], ' / ', ['to-string', ['get', 'anomaly']]],
					offset: [0, 0.4]
				}
			});

			//Create a layer to render the individual locations.
			let pinSymbolLayer = new atlas.layer.SymbolLayer(datasource, "sl1", {
				iconOptions: {
					image: [
						'case',
						['>=', ['get', 'anomaly'], 1], 'marker-red',
						'marker-green'
					],
				},
				textOptions: {
					textField: ['get', 'name'],
					offset: [0, -2.5],
					color: 'black'
				},
				filter: ['!', ['has', 'point_count']] //Filter out clustered points from this layer.
			})
			
			//Add the clusterBubbleLayer and two additional layers to the map.
			_map.layers.add([clusterBubbleLayer, clusterSymbolLayer, pinSymbolLayer]);
			
			_map.events.add('click', pinSymbolLayer, this.clicked);
			
			//Add points to datasource 
			datasource.add(this.featureCollection);

			this.map = _map;
		}
	}

	private clicked(e: atlas.MapMouseEvent){
		if (e.shapes && e.shapes.length > 0) {
			if (e.shapes[0] instanceof atlas.Shape && e.shapes[0].getType() === 'Point') {
				var properties = e.shapes[0].getProperties();
			window.location.href = "https://orgd03ac79d.crm4.dynamics.com/main.aspx?appid=417c49a8-e6e2-e911-a849-000d3a39e21d&pagetype=entityrecord&etn=ts_trafiksignal&id=" + properties.id as string;
			}
		}
	}
	/** 
	 * It is called by the framework prior to a control receiving new data. 
	 * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as “bound” or “output”
	 */
	public getOutputs(): IOutputs
	{
		return {};
	}

	/** 
	 * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
	 * i.e. cancelling any pending remote calls, removing listeners, etc.
	 */
	public destroy(): void
	{
		// Add code to cleanup control if necessary
	}

}