
  function setCount(category)
    var count=0;
    {% for post in site.posts %}
     {% if post.categories[0] == category %}
       count++;
     {% endif %}
    {% endfor %}
    alert(count);
    $("h2").append("("+count +")")
