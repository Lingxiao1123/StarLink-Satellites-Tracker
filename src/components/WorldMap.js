import React, { Component } from "react";
import { geoKavrayskiy7 } from "d3-geo-projection";
import { geoGraticule, geoPath } from "d3-geo";
import { select as d3Select } from "d3-selection";
import { schemeCategory10 } from "d3-scale-chromatic";
import * as d3Scale from "d3-scale";
import { timeFormat as d3TimeFormat } from "d3-time-format";

import {
  WORLD_MAP_URL,
  SATELLITE_POSITION_URL,
  SAT_API_KEY,
} from "../constant";
import { Spin } from "antd";
import axios from "axios";
import { feature } from "topojson-client";

const width = 960;
const height = 600;

class WorldMap extends Component {
  countries;
  constructor() {
    super();
    this.state = {
      isLoading: false,
      isDrawing: false,
    };
    this.map = null;
    this.color = d3Scale.scaleOrdinal(schemeCategory10);
    this.refMap = React.createRef();
    this.refTrack = React.createRef();
  }

  componentDidMount() {
    axios
      .get(WORLD_MAP_URL)
      .then((res) => {
        const { data } = res;
        const land = feature(data, data.objects.countries).features;
        this.generateMap(land);
      })
      .catch((e) => {
        console.log("err in fetch map data ", e.message);
      });
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    if (prevProps.satData !== this.props.satData) {
      const { latitude, longitude, elevation, altitude, duration } =
        this.props.observerData;
      const endTime = duration * 60;

      this.setState({
        isLoading: true,
      });

      const urls = this.props.satData.map((sat) => {
        const { satid } = sat;
        const url = `/api/${SATELLITE_POSITION_URL}/${satid}/${latitude}/${longitude}/${elevation}/${endTime}/&apiKey=${SAT_API_KEY}`;

        return axios.get(url);
      });

      Promise.all(urls)
        .then((res) => {
          const arr = res.map((sat) => sat.data);
          this.setState({
            isLoading: false,
            isDrawing: true,
          });

          if (!prevState.isDrawing) {
            this.track(arr);
          } else {
            const oHint = document.getElementsByClassName("hint")[0];
            oHint.innerHTML =
              "Please wait for these satellite animation to finish before selection new ones!";
          }
        })
        .catch((e) => {
          console.log("err in fetch satellite position -> ", e.message);
        });
    }
  }

  track = (data) => {
    if (!data[0].hasOwnProperty("positions")) {
      throw new Error("no position data");
      return;
    }

    const len = data[0].positions.length;
    const { duration } = this.props.observerData;
    const { context2 } = this.map;

    let now = new Date();

    let i = 0;

    let timer = setInterval(() => {
      let ct = new Date();
      //计算时间流逝 i===0表示当前点
      //真实时间是time interval的60倍
      let timePassed = i === 0 ? 0 : ct - now;
      //真实时间，时钟显示
      let time = new Date(now.getTime() + 60 * timePassed);
      //删除上一秒时间
      context2.clearRect(0, 0, width, height);
      //进行第二次时间打点
      context2.font = "bold 14px sans-serif";
      context2.fillStyle = "#333";
      context2.textAlign = "center";
      //d3TimeFormat（）填充时间
      context2.fillText(d3TimeFormat(time), width / 2, 10);
      //清除
      if (i >= len) {
        clearInterval(timer);
        this.setState({ isDrawing: false });
        const oHint = document.getElementsByClassName("hint")[0];
        oHint.innerHTML = "";
        return;
      }
      //else 作图 ->选中卫星列表的每一个点
      data.forEach((sat) => {
        const { info, positions } = sat;
        this.drawSat(info, positions[i]);
      });
      //i += 60 =>每60秒打一次点
      i += 60;
    }, 1000);
  };

  //
  drawSat = (sat, pos) => {
    const { satlongitude, satlatitude } = pos;

    if (!satlongitude || !satlatitude) return;

    const { satname } = sat;
    //.match(regular expression) => join("") ,拿到number
    const nameWithNumber = satname.match(/\d+/g).join("");

    const { projection, context2 } = this.map;
    //projection(array[x,y])，array[x,y]为坐标点，projection会return地图上真实x,y位置
    const xy = projection([satlongitude, satlatitude]);

    //填充圆点属性
    context2.fillStyle = this.color(nameWithNumber);
    context2.beginPath();
    context2.arc(xy[0], xy[1], 4, 0, 2 * Math.PI);
    context2.fill();
    //填充字体属性
    context2.font = "bold 11px sans-serif";
    context2.textAlign = "center";
    //填充数字
    context2.fillText(nameWithNumber, xy[0], xy[1] + 14);
  };

  render() {
    const { isLoading } = this.state;
    return (
      <div className="map-box">
        {isLoading ? (
          <div className="spinner">
            <Spin tip="Loading..." size="large" />
          </div>
        ) : null}
        <canvas className="map" ref={this.refMap} />
        <canvas className="track" ref={this.refTrack} />
        <div className="hint" />
      </div>
    );
  }

  generateMap = (land) => {
    const projection = geoKavrayskiy7()
      .scale(170)
      .translate([width / 2, height / 2])
      .precision(0.1);

    const graticule = geoGraticule();

    const canvas = d3Select(this.refMap.current)
      .attr("width", width)
      .attr("height", height);

    const canvas2 = d3Select(this.refTrack.current)
      .attr("width", width)
      .attr("height", height);

    const context = canvas.node().getContext("2d");
    const context2 = canvas2.node().getContext("2d");

    let path = geoPath().projection(projection).context(context);

    land.forEach((ele) => {
      context.fillStyle = "#B3DDEF";
      context.strokeStyle = "#000";
      context.globalAlpha = 0.7;
      context.beginPath();
      path(ele);
      context.fill();
      context.stroke();

      context.strokeStyle = "rgba(220, 220, 220, 0.1)";
      context.beginPath();
      path(graticule());
      context.lineWidth = 0.1;
      context.stroke();

      context.beginPath();
      context.lineWidth = 0.5;
      path(graticule.outline());
      context.stroke();
    });

    this.map = {
      projection: projection,
      graticule: graticule,
      context: context,
      context2: context2,
    };
  };
}

export default WorldMap;
